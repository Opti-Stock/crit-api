import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import type { OperationalAccessScope } from "../../shared/access/operational-access-scope.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/app-error.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import type { CreateAppointmentInput, ListAppointmentsInput, UpdateAppointmentInput } from "./appointments.validation.js";

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
  attendanceStatus: string | null;
  checkInStatus: "checked_in" | "not_checked_in";
  isCheckedIn: boolean;
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
  attendance_status: string | null;
  check_in_id: string | null;
}

const SELECT_APPOINTMENT = `
  SELECT a.id,
    a.patient_id, p.full_name AS patient_full_name,
    a.collaborator_id, co.full_name AS collaborator_full_name,
    a.clinic_id, cl.name AS clinic_name,
    a.room_id, r.name AS room_name,
    a.appointment_type_id, at.name AS appointment_type_name,
    a.starts_at, a.ends_at, a.pre_session_minutes, a.post_session_minutes, a.status,
    ar.status AS attendance_status,
    aci.id AS check_in_id
  FROM appointments a
  JOIN patients p ON p.tenant_id = a.tenant_id AND p.id = a.patient_id
  JOIN collaborators co ON co.tenant_id = a.tenant_id AND co.id = a.collaborator_id
  JOIN clinics cl ON cl.tenant_id = a.tenant_id AND cl.id = a.clinic_id
  JOIN rooms r ON r.tenant_id = a.tenant_id AND r.id = a.room_id
  JOIN appointment_types at ON at.tenant_id = a.tenant_id AND at.id = a.appointment_type_id
  LEFT JOIN attendance_records ar
    ON ar.tenant_id = a.tenant_id
   AND ar.appointment_id = a.id
   AND ar.deleted_at IS NULL
  LEFT JOIN appointment_check_ins aci
    ON aci.tenant_id = a.tenant_id
   AND aci.appointment_id = a.id
   AND aci.deleted_at IS NULL
`;

export class AppointmentsRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async list(
    tenantId: string,
    actorId: string,
    input: ListAppointmentsInput,
    scope: OperationalAccessScope
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const filters = ["a.tenant_id = $1", "a.deleted_at IS NULL"];
      const values: unknown[] = [tenantId];

      const hasAccess = await this.appendAccessFilter(
        client,
        tenantId,
        actorId,
        scope,
        values,
        filters
      );
      if (!hasAccess) return { appointments: [], total: 0 };

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
    appointmentId: string,
    scope: OperationalAccessScope
  ): Promise<AppointmentSummary | null> {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const filters = ["a.tenant_id = $1", "a.id = $2", "a.deleted_at IS NULL"];
      const values: unknown[] = [tenantId, appointmentId];
      const hasAccess = await this.appendAccessFilter(
        client,
        tenantId,
        actorId,
        scope,
        values,
        filters
      );
      if (!hasAccess) return null;
      return this.findByFilters(client, filters, values);
    }, this.databasePool);
  }

  async create(
    tenantId: string,
    actorId: string,
    input: CreateAppointmentInput,
    scope: OperationalAccessScope
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      if (!scope.tenantWide) {
        const clinicIds = scope.clinics
          ? await this.resolveAccessibleClinicIds(client, tenantId, actorId)
          : [];
        if (!clinicIds.includes(input.clinicId)) {
          throw new ForbiddenError(
            "You cannot create appointments for this clinic",
            "APPOINTMENT_CLINIC_FORBIDDEN"
          );
        }
      }

      try {
        await this.lockSchedulingResources(client, tenantId, [
          input.patientId,
          input.collaboratorId,
          input.roomId
        ]);
        await this.assertSlotAvailable(client, tenantId, {
          patientId: input.patientId,
          collaboratorId: input.collaboratorId,
          clinicId: input.clinicId,
          roomId: input.roomId,
          appointmentTypeId: input.appointmentTypeId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          preSessionMinutes: input.preSessionMinutes,
          postSessionMinutes: input.postSessionMinutes,
          recommendationId: input.recommendationId
        });

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

  async update(
    tenantId: string,
    actorId: string,
    appointmentId: string,
    input: UpdateAppointmentInput,
    scope: OperationalAccessScope
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      if (!scope.tenantWide) {
        const clinicIds = scope.clinics
          ? await this.resolveAccessibleClinicIds(client, tenantId, actorId)
          : [];
        const current = await client.query<{ clinic_id: string }>(
          `SELECT clinic_id FROM appointments
           WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [tenantId, appointmentId]
        );
        const currentClinicId = current.rows[0]?.clinic_id;
        if (!currentClinicId || !clinicIds.includes(currentClinicId)) {
          throw new ForbiddenError(
            "You cannot update appointments for this clinic",
            "APPOINTMENT_CLINIC_FORBIDDEN"
          );
        }
        if (input.clinicId && !clinicIds.includes(input.clinicId)) {
          throw new ForbiddenError(
            "You cannot move appointments to this clinic",
            "APPOINTMENT_CLINIC_FORBIDDEN"
          );
        }
      }

      try {
        const current = await client.query<{
          patient_id: string;
          collaborator_id: string;
          clinic_id: string;
          room_id: string;
          appointment_type_id: string;
          starts_at: string;
          ends_at: string;
          pre_session_minutes: number;
          post_session_minutes: number;
        }>(
          `SELECT patient_id, collaborator_id, clinic_id, room_id, appointment_type_id,
                  starts_at, ends_at, pre_session_minutes, post_session_minutes
           FROM appointments
           WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [tenantId, appointmentId]
        );
        const currentRow = current.rows[0];
        if (!currentRow) {
          throw new NotFoundError("Appointment not found", "APPOINTMENT_NOT_FOUND");
        }

        const nextSlot = {
          patientId: input.patientId ?? currentRow.patient_id,
          collaboratorId: input.collaboratorId ?? currentRow.collaborator_id,
          clinicId: input.clinicId ?? currentRow.clinic_id,
          roomId: input.roomId ?? currentRow.room_id,
          appointmentTypeId: input.appointmentTypeId ?? currentRow.appointment_type_id,
          startsAt: input.startsAt ?? currentRow.starts_at,
          endsAt: input.endsAt ?? currentRow.ends_at,
          preSessionMinutes: input.preSessionMinutes ?? currentRow.pre_session_minutes,
          postSessionMinutes: input.postSessionMinutes ?? currentRow.post_session_minutes,
          recommendationId: input.recommendationId,
          excludeAppointmentId: appointmentId
        };
        await this.lockSchedulingResources(client, tenantId, [
          nextSlot.patientId,
          nextSlot.collaboratorId,
          nextSlot.roomId
        ]);
        await this.assertSlotAvailable(client, tenantId, nextSlot);

        const result = await client.query<{ id: string }>(
          `UPDATE appointments
           SET patient_id = COALESCE($3, patient_id),
               collaborator_id = COALESCE($4, collaborator_id),
               clinic_id = COALESCE($5, clinic_id),
               room_id = COALESCE($6, room_id),
               appointment_type_id = COALESCE($7, appointment_type_id),
               starts_at = COALESCE($8, starts_at),
               ends_at = COALESCE($9, ends_at),
               pre_session_minutes = COALESCE($10, pre_session_minutes),
               post_session_minutes = COALESCE($11, post_session_minutes),
               status = COALESCE($12, status),
               updated_by_user_id = $13
           WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
           RETURNING id`,
          [
            tenantId,
            appointmentId,
            input.patientId ?? null,
            input.collaboratorId ?? null,
            input.clinicId ?? null,
            input.roomId ?? null,
            input.appointmentTypeId ?? null,
            input.startsAt ?? null,
            input.endsAt ?? null,
            input.preSessionMinutes ?? null,
            input.postSessionMinutes ?? null,
            input.status ?? null,
            actorId
          ]
        );
        if (result.rowCount === 0) {
          throw new NotFoundError("Appointment not found", "APPOINTMENT_NOT_FOUND");
        }
        return (await this.findByIdWithClient(client, tenantId, appointmentId))!;
      } catch (error) {
        throw mapDatabaseError(error);
      }
    }, this.databasePool);
  }

  private async findByIdWithClient(client: PoolClient, tenantId: string, appointmentId: string) {
    return this.findByFilters(
      client,
      ["a.tenant_id = $1", "a.id = $2", "a.deleted_at IS NULL"],
      [tenantId, appointmentId]
    );
  }

  private async lockSchedulingResources(
    client: PoolClient,
    tenantId: string,
    resourceIds: string[]
  ) {
    for (const resourceId of [...new Set(resourceIds)].sort()) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`${tenantId}:${resourceId}`]
      );
    }
  }

  private async assertSlotAvailable(
    client: PoolClient,
    tenantId: string,
    input: {
      patientId: string;
      collaboratorId: string;
      clinicId: string;
      roomId: string;
      appointmentTypeId: string;
      startsAt: string;
      endsAt: string;
      preSessionMinutes: number;
      postSessionMinutes: number;
      recommendationId?: string;
      excludeAppointmentId?: string;
    }
  ) {
    const check = await client.query<{
      valid_references: boolean;
      valid_duration_and_buffers: boolean;
      inside_operating_hours: boolean;
      inside_collaborator_availability: boolean;
      has_block: boolean;
      has_conflict: boolean;
    }>(
      `WITH slot AS (
         SELECT
           $1::uuid AS tenant_id, $2::uuid AS patient_id,
           $3::uuid AS collaborator_id, $4::uuid AS clinic_id,
           $5::uuid AS room_id, $6::uuid AS appointment_type_id,
           $7::timestamptz AS starts_at, $8::timestamptz AS ends_at,
           $9::integer AS pre_minutes, $10::integer AS post_minutes,
           $11::uuid AS exclude_id
       ),
       configured AS (
         SELECT slot.*, clinic.time_zone, appointment_type.default_duration_minutes,
           appointment_type.default_pre_session_minutes,
           appointment_type.default_post_session_minutes
         FROM slot
         JOIN patients patient
           ON patient.tenant_id = slot.tenant_id AND patient.id = slot.patient_id
          AND patient.deleted_at IS NULL
         JOIN clinics clinic
           ON clinic.tenant_id = slot.tenant_id AND clinic.id = slot.clinic_id
          AND clinic.deleted_at IS NULL
         JOIN rooms room
           ON room.tenant_id = slot.tenant_id AND room.clinic_id = slot.clinic_id
          AND room.id = slot.room_id AND room.deleted_at IS NULL
         JOIN collaborator_clinics membership
           ON membership.tenant_id = slot.tenant_id
          AND membership.collaborator_id = slot.collaborator_id
          AND membership.clinic_id = slot.clinic_id
         JOIN appointment_types appointment_type
           ON appointment_type.tenant_id = slot.tenant_id
          AND appointment_type.id = slot.appointment_type_id
          AND appointment_type.deleted_at IS NULL
         JOIN clinic_appointment_types clinic_type
           ON clinic_type.tenant_id = slot.tenant_id
          AND clinic_type.clinic_id = slot.clinic_id
          AND clinic_type.appointment_type_id = slot.appointment_type_id
         JOIN collaborator_appointment_types collaborator_type
           ON collaborator_type.tenant_id = slot.tenant_id
          AND collaborator_type.collaborator_id = slot.collaborator_id
          AND collaborator_type.appointment_type_id = slot.appointment_type_id
         JOIN room_appointment_types room_type
           ON room_type.tenant_id = slot.tenant_id
          AND room_type.clinic_id = slot.clinic_id
          AND room_type.room_id = slot.room_id
          AND room_type.appointment_type_id = slot.appointment_type_id
       )
       SELECT
         EXISTS (SELECT 1 FROM configured) AS valid_references,
         EXISTS (
           SELECT 1 FROM configured
           WHERE ends_at - starts_at = make_interval(mins => default_duration_minutes)
             AND pre_minutes = default_pre_session_minutes
             AND post_minutes = default_post_session_minutes
         ) AS valid_duration_and_buffers,
         EXISTS (
           SELECT 1 FROM configured
           JOIN clinic_operating_hours hours
             ON hours.tenant_id = configured.tenant_id
            AND hours.clinic_id = configured.clinic_id
            AND hours.weekday = EXTRACT(DOW FROM starts_at AT TIME ZONE time_zone)
            AND hours.start_time <= (starts_at AT TIME ZONE time_zone)::time
            AND hours.end_time >= (ends_at AT TIME ZONE time_zone)::time
            AND hours.deleted_at IS NULL
         ) AS inside_operating_hours,
         EXISTS (
           SELECT 1 FROM configured
           JOIN collaborator_availability availability
             ON availability.tenant_id = configured.tenant_id
            AND availability.collaborator_id = configured.collaborator_id
            AND availability.clinic_id = configured.clinic_id
            AND availability.weekday = EXTRACT(DOW FROM starts_at AT TIME ZONE time_zone)
            AND availability.valid_from <= (starts_at AT TIME ZONE time_zone)::date
            AND (
              availability.valid_to IS NULL
              OR availability.valid_to >= (starts_at AT TIME ZONE time_zone)::date
            )
            AND availability.start_time <= (starts_at AT TIME ZONE time_zone)::time
            AND availability.end_time >= (ends_at AT TIME ZONE time_zone)::time
            AND availability.deleted_at IS NULL
         ) AS inside_collaborator_availability,
         EXISTS (
           SELECT 1 FROM configured
           JOIN scheduling_blocks block
             ON block.tenant_id = configured.tenant_id
            AND block.clinic_id = configured.clinic_id
            AND block.deleted_at IS NULL
            AND (block.collaborator_id IS NULL OR block.collaborator_id = configured.collaborator_id)
            AND (block.room_id IS NULL OR block.room_id = configured.room_id)
            AND block.starts_at < configured.ends_at + make_interval(mins => configured.post_minutes)
            AND block.ends_at > configured.starts_at - make_interval(mins => configured.pre_minutes)
         ) AS has_block,
         EXISTS (
           SELECT 1 FROM configured
           JOIN appointments appointment
             ON appointment.tenant_id = configured.tenant_id
            AND appointment.deleted_at IS NULL
            AND appointment.status <> 'cancelled'
            AND (configured.exclude_id IS NULL OR appointment.id <> configured.exclude_id)
            AND (
              appointment.patient_id = configured.patient_id
              OR appointment.collaborator_id = configured.collaborator_id
              OR (
                appointment.clinic_id = configured.clinic_id
                AND appointment.room_id = configured.room_id
              )
            )
            AND appointment.starts_at - make_interval(mins => appointment.pre_session_minutes)
              < configured.ends_at + make_interval(mins => configured.post_minutes)
            AND appointment.ends_at + make_interval(mins => appointment.post_session_minutes)
              > configured.starts_at - make_interval(mins => configured.pre_minutes)
         ) AS has_conflict`,
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
        input.excludeAppointmentId ?? null
      ]
    );
    const result = check.rows[0]!;
    const stale = () => new ConflictError(
      "The recommended appointment is no longer available",
      "APPOINTMENT_RECOMMENDATION_STALE"
    );

    if (!result.valid_references) {
      if (input.recommendationId) throw stale();
      throw new BadRequestError(
        "Appointment resources are inactive or incompatible",
        "INVALID_APPOINTMENT_CONFIGURATION"
      );
    }
    if (!result.valid_duration_and_buffers) {
      throw new BadRequestError(
        "Duration and buffers must match the appointment type",
        "INVALID_APPOINTMENT_DURATION"
      );
    }
    if (!result.inside_operating_hours || !result.inside_collaborator_availability) {
      if (input.recommendationId) throw stale();
      throw new BadRequestError(
        "Appointment is outside clinic or collaborator hours",
        "APPOINTMENT_OUTSIDE_AVAILABILITY"
      );
    }
    if (result.has_block || result.has_conflict) {
      if (input.recommendationId) throw stale();
      throw new ConflictError(
        result.has_block
          ? "Appointment overlaps a scheduling block"
          : "Appointment overlaps an existing appointment",
        result.has_block ? "APPOINTMENT_BLOCKED" : "APPOINTMENT_TIME_CONFLICT"
      );
    }
  }

  private async findByFilters(client: PoolClient, filters: string[], values: unknown[]) {
    const result = await client.query<AppointmentRow>(
      `${SELECT_APPOINTMENT} WHERE ${filters.join(" AND ")}`,
      values
    );
    return result.rows[0] ? mapSummary(result.rows[0]) : null;
  }

  private async appendAccessFilter(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    scope: OperationalAccessScope,
    values: unknown[],
    filters: string[]
  ): Promise<boolean> {
    if (scope.tenantWide) return true;

    const accessClauses: string[] = [];
    if (scope.clinics) {
      const clinicIds = await this.resolveAccessibleClinicIds(client, tenantId, actorId);
      if (clinicIds.length > 0) {
        values.push(clinicIds);
        accessClauses.push(`a.clinic_id = ANY($${values.length}::uuid[])`);
      }
    }
    if (scope.ownCollaborator) {
      const collaboratorId = await this.resolveOwnCollaboratorId(client, tenantId, actorId);
      if (collaboratorId) {
        values.push(collaboratorId);
        accessClauses.push(`a.collaborator_id = $${values.length}`);
      }
    }
    if (accessClauses.length === 0) return false;
    filters.push(`(${accessClauses.join(" OR ")})`);
    return true;
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
    status: row.status,
    attendanceStatus: row.attendance_status,
    checkInStatus: row.check_in_id ? "checked_in" : "not_checked_in",
    isCheckedIn: Boolean(row.check_in_id)
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
