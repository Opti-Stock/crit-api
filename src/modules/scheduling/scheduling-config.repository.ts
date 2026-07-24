import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import type { OperationalAccessScope } from "../../shared/access/operational-access-scope.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError
} from "../../shared/errors/app-error.js";
import type {
  AppointmentTypeAssignmentsInput,
  CreateSchedulingBlockInput,
  OperatingHoursInput,
  PatientPreferencesInput,
  SchedulingBlocksQuery
} from "./scheduling-config.validation.js";

interface SchedulingContext {
  tenantId: string;
  userId: string;
  clinicId: string;
  scope: OperationalAccessScope;
}

export class SchedulingConfigRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  listOperatingHours(context: SchedulingContext) {
    return this.inClinic(context, async (client) => {
      const result = await client.query(
        `SELECT id, weekday, start_time AS "startTime", end_time AS "endTime",
                updated_at AS "updatedAt"
         FROM clinic_operating_hours
         WHERE tenant_id = $1 AND clinic_id = $2 AND deleted_at IS NULL
         ORDER BY weekday, start_time`,
        [context.tenantId, context.clinicId]
      );
      return result.rows;
    });
  }

  replaceOperatingHours(context: SchedulingContext, input: OperatingHoursInput) {
    return this.inClinic(context, async (client) => {
      await client.query(
        `UPDATE clinic_operating_hours
         SET deleted_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
        [context.tenantId, context.clinicId]
      );
      for (const slot of input.hours) {
        await client.query(
          `INSERT INTO clinic_operating_hours (
             tenant_id, clinic_id, weekday, start_time, end_time
           ) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (tenant_id, clinic_id, weekday, start_time, end_time)
           DO UPDATE SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP`,
          [
            context.tenantId,
            context.clinicId,
            slot.weekday,
            slot.startTime,
            slot.endTime
          ]
        );
      }
      return this.selectOperatingHours(client, context);
    });
  }

  listClinicAppointmentTypes(context: SchedulingContext) {
    return this.listAssignments(context, "clinic_appointment_types", "clinic_id");
  }

  replaceClinicAppointmentTypes(
    context: SchedulingContext,
    input: AppointmentTypeAssignmentsInput
  ) {
    return this.replaceAssignments(
      context,
      "clinic_appointment_types",
      "clinic_id",
      context.clinicId,
      input
    );
  }

  listCollaboratorAppointmentTypes(
    context: SchedulingContext,
    collaboratorId: string
  ) {
    return this.inClinic(context, async (client) => {
      await assertCollaboratorMembership(client, context, collaboratorId);
      return selectAssignmentIds(
        client,
        "collaborator_appointment_types",
        "collaborator_id",
        context.tenantId,
        collaboratorId
      );
    });
  }

  replaceCollaboratorAppointmentTypes(
    context: SchedulingContext,
    collaboratorId: string,
    input: AppointmentTypeAssignmentsInput
  ) {
    return this.inClinic(context, async (client) => {
      await assertCollaboratorMembership(client, context, collaboratorId);
      return replaceAssignmentIds(
        client,
        "collaborator_appointment_types",
        "collaborator_id",
        context.tenantId,
        collaboratorId,
        input.appointmentTypeIds
      );
    });
  }

  listRoomAppointmentTypes(context: SchedulingContext, roomId: string) {
    return this.inClinic(context, async (client) => {
      await assertRoom(client, context, roomId);
      return selectAssignmentIds(
        client,
        "room_appointment_types",
        "room_id",
        context.tenantId,
        roomId
      );
    });
  }

  replaceRoomAppointmentTypes(
    context: SchedulingContext,
    roomId: string,
    input: AppointmentTypeAssignmentsInput
  ) {
    return this.inClinic(context, async (client) => {
      await assertRoom(client, context, roomId);
      await assertAppointmentTypes(client, context.tenantId, input.appointmentTypeIds);
      await client.query(
        `DELETE FROM room_appointment_types
         WHERE tenant_id = $1 AND room_id = $2`,
        [context.tenantId, roomId]
      );
      for (const appointmentTypeId of input.appointmentTypeIds) {
        await client.query(
          `INSERT INTO room_appointment_types (
             tenant_id, clinic_id, room_id, appointment_type_id
           ) VALUES ($1, $2, $3, $4)`,
          [context.tenantId, context.clinicId, roomId, appointmentTypeId]
        );
      }
      return { appointmentTypeIds: [...input.appointmentTypeIds].sort() };
    });
  }

  listBlocks(context: SchedulingContext, query: SchedulingBlocksQuery) {
    return this.inClinic(context, async (client) => {
      const result = await client.query(
        `SELECT id, clinic_id AS "clinicId",
                collaborator_id AS "collaboratorId", room_id AS "roomId",
                starts_at AS "startsAt", ends_at AS "endsAt", reason,
                created_by_user_id AS "createdByUserId",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM scheduling_blocks
         WHERE tenant_id = $1 AND clinic_id = $2 AND deleted_at IS NULL
           AND ($3::timestamptz IS NULL OR ends_at > $3)
           AND ($4::timestamptz IS NULL OR starts_at < $4)
         ORDER BY starts_at, id`,
        [
          context.tenantId,
          context.clinicId,
          query.startsAt ?? null,
          query.endsAt ?? null
        ]
      );
      return result.rows;
    });
  }

  createBlock(context: SchedulingContext, input: CreateSchedulingBlockInput) {
    return this.inClinic(context, async (client) => {
      if (input.collaboratorId) {
        await assertCollaboratorMembership(client, context, input.collaboratorId);
      }
      if (input.roomId) {
        await assertRoom(client, context, input.roomId);
      }
      const result = await client.query(
        `INSERT INTO scheduling_blocks (
           tenant_id, clinic_id, collaborator_id, room_id,
           starts_at, ends_at, reason, created_by_user_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, clinic_id AS "clinicId",
                   collaborator_id AS "collaboratorId", room_id AS "roomId",
                   starts_at AS "startsAt", ends_at AS "endsAt", reason,
                   created_by_user_id AS "createdByUserId",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          context.tenantId,
          context.clinicId,
          input.collaboratorId ?? null,
          input.roomId ?? null,
          input.startsAt,
          input.endsAt,
          input.reason,
          context.userId
        ]
      );
      return result.rows[0];
    });
  }

  deleteBlock(context: SchedulingContext, blockId: string) {
    return this.inClinic(context, async (client) => {
      const result = await client.query(
        `UPDATE scheduling_blocks
         SET deleted_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND clinic_id = $2 AND id = $3
           AND deleted_at IS NULL
         RETURNING id`,
        [context.tenantId, context.clinicId, blockId]
      );
      if (!result.rows[0]) {
        throw new NotFoundError("Scheduling block not found", "SCHEDULING_BLOCK_NOT_FOUND");
      }
    });
  }

  listPatientPreferences(context: SchedulingContext, patientId: string) {
    return this.inClinic(context, async (client) => {
      await assertPatient(client, context.tenantId, patientId);
      return this.selectPatientPreferences(client, context, patientId);
    });
  }

  replacePatientPreferences(
    context: SchedulingContext,
    patientId: string,
    input: PatientPreferencesInput
  ) {
    return this.inClinic(context, async (client) => {
      await assertPatient(client, context.tenantId, patientId);
      await client.query(
        `UPDATE patient_scheduling_preferences
         SET deleted_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND patient_id = $2 AND clinic_id = $3
           AND deleted_at IS NULL`,
        [context.tenantId, patientId, context.clinicId]
      );
      for (const preference of input.preferences) {
        await client.query(
          `INSERT INTO patient_scheduling_preferences (
             tenant_id, patient_id, clinic_id, weekday,
             start_time, end_time, created_by_user_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (
             tenant_id, patient_id, clinic_id, weekday, start_time, end_time
           ) DO UPDATE SET
             deleted_at = NULL,
             created_by_user_id = EXCLUDED.created_by_user_id,
             updated_at = CURRENT_TIMESTAMP`,
          [
            context.tenantId,
            patientId,
            context.clinicId,
            preference.weekday,
            preference.startTime,
            preference.endTime,
            context.userId
          ]
        );
      }
      return this.selectPatientPreferences(client, context, patientId);
    });
  }

  private inClinic<TResult>(
    context: SchedulingContext,
    operation: (client: PoolClient) => Promise<TResult>
  ) {
    return withTenantTransaction(
      { tenantId: context.tenantId, userId: context.userId },
      async (client) => {
        try {
          await assertClinicAccess(client, context);
          return await operation(client);
        } catch (error) {
          throw mapSchedulingError(error);
        }
      },
      this.databasePool
    );
  }

  private async selectOperatingHours(
    client: PoolClient,
    context: SchedulingContext
  ) {
    const result = await client.query(
      `SELECT id, weekday, start_time AS "startTime", end_time AS "endTime",
              updated_at AS "updatedAt"
       FROM clinic_operating_hours
       WHERE tenant_id = $1 AND clinic_id = $2 AND deleted_at IS NULL
       ORDER BY weekday, start_time`,
      [context.tenantId, context.clinicId]
    );
    return result.rows;
  }

  private listAssignments(
    context: SchedulingContext,
    table: "clinic_appointment_types",
    column: "clinic_id"
  ) {
    return this.inClinic(context, (client) => selectAssignmentIds(
      client,
      table,
      column,
      context.tenantId,
      context.clinicId
    ));
  }

  private replaceAssignments(
    context: SchedulingContext,
    table: "clinic_appointment_types",
    column: "clinic_id",
    targetId: string,
    input: AppointmentTypeAssignmentsInput
  ) {
    return this.inClinic(context, (client) => replaceAssignmentIds(
      client,
      table,
      column,
      context.tenantId,
      targetId,
      input.appointmentTypeIds
    ));
  }

  private async selectPatientPreferences(
    client: PoolClient,
    context: SchedulingContext,
    patientId: string
  ) {
    const result = await client.query(
      `SELECT id, weekday, start_time AS "startTime", end_time AS "endTime",
              updated_at AS "updatedAt"
       FROM patient_scheduling_preferences
       WHERE tenant_id = $1 AND patient_id = $2 AND clinic_id = $3
         AND deleted_at IS NULL
       ORDER BY weekday, start_time`,
      [context.tenantId, patientId, context.clinicId]
    );
    return result.rows;
  }
}

async function assertClinicAccess(
  client: PoolClient,
  context: SchedulingContext
) {
  const clinic = await client.query(
    `SELECT 1 FROM clinics
     WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [context.tenantId, context.clinicId]
  );
  if (!clinic.rows[0]) {
    throw new NotFoundError("Clinic not found", "CLINIC_NOT_FOUND");
  }
  if (context.scope.tenantWide) return;
  const access = await client.query(
    `SELECT 1 FROM user_clinic_access
     WHERE tenant_id = $1 AND user_id = $2 AND clinic_id = $3`,
    [context.tenantId, context.userId, context.clinicId]
  );
  if (!context.scope.clinics || !access.rows[0]) {
    throw new ForbiddenError(
      "You cannot configure scheduling for this clinic",
      "SCHEDULING_CLINIC_FORBIDDEN"
    );
  }
}

async function assertCollaboratorMembership(
  client: PoolClient,
  context: SchedulingContext,
  collaboratorId: string
) {
  const result = await client.query(
    `SELECT 1 FROM collaborator_clinics cc
     JOIN collaborators collaborator
       ON collaborator.tenant_id = cc.tenant_id
      AND collaborator.id = cc.collaborator_id
      AND collaborator.deleted_at IS NULL
     WHERE cc.tenant_id = $1 AND cc.clinic_id = $2
       AND cc.collaborator_id = $3`,
    [context.tenantId, context.clinicId, collaboratorId]
  );
  if (!result.rows[0]) {
    throw new NotFoundError(
      "Collaborator is not assigned to this clinic",
      "SCHEDULING_COLLABORATOR_NOT_FOUND"
    );
  }
}

async function assertRoom(
  client: PoolClient,
  context: SchedulingContext,
  roomId: string
) {
  const result = await client.query(
    `SELECT 1 FROM rooms
     WHERE tenant_id = $1 AND clinic_id = $2 AND id = $3
       AND deleted_at IS NULL`,
    [context.tenantId, context.clinicId, roomId]
  );
  if (!result.rows[0]) {
    throw new NotFoundError("Room not found", "SCHEDULING_ROOM_NOT_FOUND");
  }
}

async function assertPatient(
  client: PoolClient,
  tenantId: string,
  patientId: string
) {
  const result = await client.query(
    `SELECT 1 FROM patients
     WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [tenantId, patientId]
  );
  if (!result.rows[0]) {
    throw new NotFoundError("Patient not found", "PATIENT_NOT_FOUND");
  }
}

async function assertAppointmentTypes(
  client: PoolClient,
  tenantId: string,
  appointmentTypeIds: readonly string[]
) {
  if (appointmentTypeIds.length === 0) return;
  const result = await client.query<{ id: string }>(
    `SELECT id FROM appointment_types
     WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
    [tenantId, appointmentTypeIds]
  );
  if (result.rows.length !== new Set(appointmentTypeIds).size) {
    throw new BadRequestError(
      "One or more appointment types are invalid",
      "SCHEDULING_APPOINTMENT_TYPE_INVALID"
    );
  }
}

async function selectAssignmentIds(
  client: PoolClient,
  table:
    | "clinic_appointment_types"
    | "collaborator_appointment_types"
    | "room_appointment_types",
  column: "clinic_id" | "collaborator_id" | "room_id",
  tenantId: string,
  targetId: string
) {
  const result = await client.query<{ appointmentTypeId: string }>(
    `SELECT appointment_type_id AS "appointmentTypeId"
     FROM ${table}
     WHERE tenant_id = $1 AND ${column} = $2
     ORDER BY appointment_type_id`,
    [tenantId, targetId]
  );
  return { appointmentTypeIds: result.rows.map((row) => row.appointmentTypeId) };
}

async function replaceAssignmentIds(
  client: PoolClient,
  table: "clinic_appointment_types" | "collaborator_appointment_types",
  column: "clinic_id" | "collaborator_id",
  tenantId: string,
  targetId: string,
  appointmentTypeIds: readonly string[]
) {
  await assertAppointmentTypes(client, tenantId, appointmentTypeIds);
  await client.query(
    `DELETE FROM ${table} WHERE tenant_id = $1 AND ${column} = $2`,
    [tenantId, targetId]
  );
  for (const appointmentTypeId of appointmentTypeIds) {
    await client.query(
      `INSERT INTO ${table} (tenant_id, ${column}, appointment_type_id)
       VALUES ($1, $2, $3)`,
      [tenantId, targetId, appointmentTypeId]
    );
  }
  return { appointmentTypeIds: [...appointmentTypeIds].sort() };
}

function mapSchedulingError(error: unknown) {
  if (
    error instanceof BadRequestError
    || error instanceof ConflictError
    || error instanceof ForbiddenError
    || error instanceof NotFoundError
  ) {
    return error;
  }
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  if (code === "23505") {
    return new ConflictError(
      "Scheduling configuration conflicts with an existing rule",
      "SCHEDULING_CONFIGURATION_CONFLICT"
    );
  }
  if (code === "23503" || code === "23514") {
    return new BadRequestError(
      "Scheduling configuration references invalid or incompatible data",
      "SCHEDULING_CONFIGURATION_INVALID"
    );
  }
  return error;
}
