import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import { BadRequestError, ConflictError } from "../../shared/errors/app-error.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import type { CreateAppointmentInput, ListAppointmentsInput } from "./appointments.validation.js";

export type AppointmentAccessScope = { kind: "all" } | { kind: "clinics" } | { kind: "own-collaborator" };

export interface AppointmentSummary {
  id: string;
  patient: { id: string; fullName: string };
  collaborator: { id: string; fullName: string };
  clinic: { id: string; name: string };
  room: { id: string; name: string };
  appointmentType: { id: string; name: string };
  startsAt: string;
  endsAt: string;
  preSessionMinutes: number;
  postSessionMinutes: number;
  status: string;
}

interface AppointmentRow {
  id: string;
  patient_id: string;
  patient_full_name: string;
  collaborator_id: string;
  collaborator_full_name: string;
  clinic_id: string;
  clinic_name: string;
  room_id: string;
  room_name: string;
  appointment_type_id: string;
  appointment_type_name: string;
  starts_at: string;
  ends_at: string;
  pre_session_minutes: number;
  post_session_minutes: number;
  status: string;
}

const SELECT_APPOINTMENT = `
  SELECT a.id,
    a.patient_id, p.full_name AS patient_full_name,
    a.collaborator_id, co.full_name AS collaborator_full_name,
    a.clinic_id, cl.name AS clinic_name,
    a.room_id, r.name AS room_name,
    a.appointment_type_id, at.name AS appointment_type_name,
    a.starts_at, a.ends_at, a.pre_session_minutes, a.post_session_minutes, a.status
  FROM appointments a
  JOIN patients p ON p.tenant_id = a.tenant_id AND p.id = a.patient_id
  JOIN collaborators co ON co.tenant_id = a.tenant_id AND co.id = a.collaborator_id
  JOIN clinics cl ON cl.tenant_id = a.tenant_id AND cl.id = a.clinic_id
  JOIN rooms r ON r.tenant_id = a.tenant_id AND r.id = a.room_id
  JOIN appointment_types at ON at.tenant_id = a.tenant_id AND at.id = a.appointment_type_id
`;

export class AppointmentsRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async list(
    tenantId: string,
    actorId: string,
    input: ListAppointmentsInput,
    scope: AppointmentAccessScope
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const filters = ["a.tenant_id = $1", "a.deleted_at IS NULL"];
      const values: unknown[] = [tenantId];

      if (scope.kind === "own-collaborator") {
        const collaboratorId = await this.resolveOwnCollaboratorId(client, tenantId, actorId);
        if (!collaboratorId) return { appointments: [], total: 0 };
        values.push(collaboratorId);
        filters.push(`a.collaborator_id = $${values.length}`);
      } else if (scope.kind === "clinics") {
        const clinicIds = await this.resolveAccessibleClinicIds(client, tenantId, actorId);
        if (clinicIds.length === 0) return { appointments: [], total: 0 };
        values.push(clinicIds);
        filters.push(`a.clinic_id = ANY($${values.length}::uuid[])`);
      }

      if (input.clinicId) {
        values.push(input.clinicId);
        filters.push(`a.clinic_id = $${values.length}`);
      }
      if (input.patientId) {
        values.push(input.patientId);
        filters.push(`a.patient_id = $${values.length}`);
      }
      if (input.collaboratorId) {
        values.push(input.collaboratorId);
        filters.push(`a.collaborator_id = $${values.length}`);
      }
      if (input.status) {
        values.push(input.status);
        filters.push(`a.status = $${values.length}`);
      }
      if (input.from) {
        values.push(input.from);
        filters.push(`a.starts_at >= $${values.length}`);
      }
      if (input.to) {
        values.push(input.to);
        filters.push(`a.starts_at <= $${values.length}`);
      }

      const where = filters.join(" AND ");
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM appointments a WHERE ${where}`,
        values
      );

      values.push(input.pageSize, (input.page - 1) * input.pageSize);
      const rows = await client.query<AppointmentRow>(
        `${SELECT_APPOINTMENT}
         WHERE ${where}
         ORDER BY a.starts_at
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );

      return { appointments: rows.rows.map(mapSummary), total: Number(count.rows[0]?.count ?? 0) };
    }, this.databasePool);
  }

  async findById(
    tenantId: string,
    actorId: string,
    appointmentId: string
  ): Promise<AppointmentSummary | null> {
    return withTenantTransaction({ tenantId, userId: actorId }, (client) =>
      this.findByIdWithClient(client, tenantId, appointmentId), this.databasePool);
  }

  async create(tenantId: string, actorId: string, input: CreateAppointmentInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      try {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO appointments (
             tenant_id, patient_id, collaborator_id, clinic_id, room_id, appointment_type_id,
             starts_at, ends_at, pre_session_minutes, post_session_minutes, created_by_user_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id`,
          [
            tenantId,
            input.patientId,
            input.collaboratorId,
            input.clinicId,
            input.roomId,
            input.appointmentTypeId,
            input.startsAt,
            input.endsAt,
            input.preSessionMinutes,
            input.postSessionMinutes,
            actorId
          ]
        );
        return (await this.findByIdWithClient(client, tenantId, inserted.rows[0]!.id))!;
      } catch (error) {
        throw mapDatabaseError(error);
      }
    }, this.databasePool);
  }

  private async findByIdWithClient(client: PoolClient, tenantId: string, appointmentId: string) {
    const result = await client.query<AppointmentRow>(
      `${SELECT_APPOINTMENT} WHERE a.tenant_id = $1 AND a.id = $2 AND a.deleted_at IS NULL`,
      [tenantId, appointmentId]
    );
    return result.rows[0] ? mapSummary(result.rows[0]) : null;
  }

  private async resolveOwnCollaboratorId(client: PoolClient, tenantId: string, userId: string) {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM collaborators WHERE tenant_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [tenantId, userId]
    );
    return result.rows[0]?.id ?? null;
  }

  private async resolveAccessibleClinicIds(client: PoolClient, tenantId: string, userId: string) {
    const result = await client.query<{ clinic_id: string }>(
      `SELECT clinic_id FROM user_clinic_access WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId]
    );
    return result.rows.map((row) => row.clinic_id);
  }
}

function mapSummary(row: AppointmentRow): AppointmentSummary {
  return {
    id: row.id,
    patient: { id: row.patient_id, fullName: row.patient_full_name },
    collaborator: { id: row.collaborator_id, fullName: row.collaborator_full_name },
    clinic: { id: row.clinic_id, name: row.clinic_name },
    room: { id: row.room_id, name: row.room_name },
    appointmentType: { id: row.appointment_type_id, name: row.appointment_type_name },
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    preSessionMinutes: row.pre_session_minutes,
    postSessionMinutes: row.post_session_minutes,
    status: row.status
  };
}

function mapDatabaseError(error: unknown): Error {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;

  if (code === "23503") {
    return new BadRequestError(
      "Patient, collaborator/clinic membership, room or appointment type is invalid",
      "INVALID_APPOINTMENT_REFERENCE"
    );
  }
  if (code === "23514") {
    return new BadRequestError("Appointment violates a data constraint", "INVALID_APPOINTMENT_DATA");
  }
  if (code === "23505") {
    return new ConflictError("Appointment conflicts with an existing record", "APPOINTMENT_CONFLICT");
  }
  return error instanceof Error ? error : new Error("Unknown database error");
}
