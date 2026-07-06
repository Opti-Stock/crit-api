import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import { insertAttendanceRegisteredEvent } from "../../integrations/crit-post-api/crit-post-api.payload.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/app-error.js";
import type { ListCheckinAppointmentsInput, CheckInAppointmentInput } from "./checkin.validation.js";

export interface CheckinAppointmentSummary {
  id: string;
  patient: { id: string; fullName: string };
  collaborator: { id: string; fullName: string };
  clinic: { id: string; name: string };
  room: { id: string; name: string };
  startsAt: string;
  endsAt: string;
  status: string;
  attendance: {
    id: string;
    status: string;
    checkedAt: string | null;
  } | null;
}

interface CheckinAppointmentRow {
  id: string;
  patient_id: string;
  patient_full_name: string;
  collaborator_id: string;
  collaborator_full_name: string;
  clinic_id: string;
  clinic_name: string;
  room_id: string;
  room_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  attendance_id: string | null;
  attendance_status: string | null;
  checked_at: string | null;
}

const SELECT_CHECKIN_APPOINTMENT = `
  SELECT a.id,
    a.patient_id, p.full_name AS patient_full_name,
    a.collaborator_id, co.full_name AS collaborator_full_name,
    a.clinic_id, cl.name AS clinic_name,
    a.room_id, r.name AS room_name,
    a.starts_at, a.ends_at, a.status,
    ar.id AS attendance_id, ar.status AS attendance_status, ar.checked_at
  FROM appointments a
  JOIN patients p ON p.tenant_id = a.tenant_id AND p.id = a.patient_id
  JOIN collaborators co ON co.tenant_id = a.tenant_id AND co.id = a.collaborator_id
  JOIN clinics cl ON cl.tenant_id = a.tenant_id AND cl.id = a.clinic_id
  JOIN rooms r ON r.tenant_id = a.tenant_id AND r.id = a.room_id
  LEFT JOIN attendance_records ar
    ON ar.tenant_id = a.tenant_id
   AND ar.appointment_id = a.id
   AND ar.deleted_at IS NULL
`;

export class CheckinRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  listAppointments(
    tenantId: string,
    actorId: string,
    actorRoles: string[],
    input: ListCheckinAppointmentsInput
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const filters = ["a.tenant_id = $1", "a.deleted_at IS NULL"];
      const values: unknown[] = [tenantId];
      await this.appendAccessFilter(client, tenantId, actorId, actorRoles, values, filters);

      if (input.date) {
        values.push(input.date);
        filters.push(`a.starts_at >= $${values.length}::date`);
        filters.push(`a.starts_at < ($${values.length}::date + INTERVAL '1 day')`);
      }
      if (input.clinicId) {
        values.push(input.clinicId);
        filters.push(`a.clinic_id = $${values.length}`);
      }
      if (input.status) {
        values.push(input.status);
        filters.push(`a.status = $${values.length}`);
      }
      if (input.search) {
        values.push(`%${input.search}%`);
        filters.push(`(p.full_name ILIKE $${values.length} OR co.full_name ILIKE $${values.length})`);
      }

      const result = await client.query<CheckinAppointmentRow>(
        `${SELECT_CHECKIN_APPOINTMENT}
         WHERE ${filters.join(" AND ")}
         ORDER BY a.starts_at, p.full_name`,
        values
      );
      return result.rows.map(mapAppointment);
    }, this.databasePool);
  }

  getAppointment(
    tenantId: string,
    actorId: string,
    actorRoles: string[],
    appointmentId: string
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const filters = ["a.tenant_id = $1", "a.id = $2", "a.deleted_at IS NULL"];
      const values: unknown[] = [tenantId, appointmentId];
      await this.appendAccessFilter(client, tenantId, actorId, actorRoles, values, filters);
      const result = await client.query<CheckinAppointmentRow>(
        `${SELECT_CHECKIN_APPOINTMENT} WHERE ${filters.join(" AND ")}`,
        values
      );
      return result.rows[0] ? mapAppointment(result.rows[0]) : null;
    }, this.databasePool);
  }

  checkIn(
    tenantId: string,
    actorId: string,
    actorRoles: string[],
    appointmentId: string,
    input: CheckInAppointmentInput
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const appointment = await client.query<{
        patient_id: string;
        collaborator_id: string;
        clinic_id: string;
      }>(
        `SELECT patient_id, collaborator_id, clinic_id
         FROM appointments
         WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [tenantId, appointmentId]
      );
      const appointmentRow = appointment.rows[0];
      if (!appointmentRow) throw new NotFoundError("Appointment not found", "APPOINTMENT_NOT_FOUND");
      await this.assertCanAccessClinic(client, tenantId, actorId, actorRoles, appointmentRow.clinic_id);

      const existing = await client.query<{ id: string }>(
        `SELECT id FROM attendance_records
         WHERE tenant_id = $1 AND appointment_id = $2 AND deleted_at IS NULL`,
        [tenantId, appointmentId]
      );
      if (existing.rows[0]) {
        throw new ConflictError("Appointment already has attendance", "CHECKIN_ALREADY_REGISTERED");
      }

      const inserted = await client.query<{ id: string; checked_at: Date | string }>(
        `INSERT INTO attendance_records (
           tenant_id, appointment_id, patient_id, collaborator_id,
           checked_by_user_id, status, checked_at, notes_required
         ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, FALSE)
         RETURNING id, checked_at`,
        [
          tenantId,
          appointmentId,
          appointmentRow.patient_id,
          appointmentRow.collaborator_id,
          actorId,
          input.status
        ]
      );
      const attendance = inserted.rows[0]!;

      await insertAttendanceRegisteredEvent(client, {
        tenantId,
        attendanceId: attendance.id,
        appointmentId,
        patientId: appointmentRow.patient_id,
        collaboratorId: appointmentRow.collaborator_id,
        status: input.status,
        checkedAt: toIsoString(attendance.checked_at)
      });

      return this.getAppointmentWithClient(client, tenantId, appointmentId);
    }, this.databasePool);
  }

  private async getAppointmentWithClient(client: PoolClient, tenantId: string, appointmentId: string) {
    const result = await client.query<CheckinAppointmentRow>(
      `${SELECT_CHECKIN_APPOINTMENT}
       WHERE a.tenant_id = $1 AND a.id = $2 AND a.deleted_at IS NULL`,
      [tenantId, appointmentId]
    );
    return mapAppointment(result.rows[0]!);
  }

  private async appendAccessFilter(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    actorRoles: string[],
    values: unknown[],
    filters: string[]
  ) {
    if (this.isTenantWide(actorRoles)) return;
    const clinicIds = await this.resolveAccessibleClinicIds(client, tenantId, actorId);
    if (clinicIds.length === 0) {
      filters.push("FALSE");
      return;
    }
    values.push(clinicIds);
    filters.push(`a.clinic_id = ANY($${values.length}::uuid[])`);
  }

  private async assertCanAccessClinic(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    actorRoles: string[],
    clinicId: string
  ) {
    if (this.isTenantWide(actorRoles)) return;
    const clinicIds = await this.resolveAccessibleClinicIds(client, tenantId, actorId);
    if (!clinicIds.includes(clinicId)) {
      throw new ForbiddenError("You cannot check in appointments for this clinic", "CHECKIN_CLINIC_FORBIDDEN");
    }
  }

  private isTenantWide(actorRoles: string[]) {
    return actorRoles.some((role) => role === "admin" || role === "direccion");
  }

  private async resolveAccessibleClinicIds(client: PoolClient, tenantId: string, userId: string) {
    const result = await client.query<{ clinic_id: string }>(
      `SELECT clinic_id FROM user_clinic_access WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId]
    );
    return result.rows.map((row) => row.clinic_id);
  }
}

function mapAppointment(row: CheckinAppointmentRow): CheckinAppointmentSummary {
  return {
    id: row.id,
    patient: { id: row.patient_id, fullName: row.patient_full_name },
    collaborator: { id: row.collaborator_id, fullName: row.collaborator_full_name },
    clinic: { id: row.clinic_id, name: row.clinic_name },
    room: { id: row.room_id, name: row.room_name },
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    attendance: row.attendance_id
      ? {
          id: row.attendance_id,
          status: row.attendance_status!,
          checkedAt: row.checked_at
        }
      : null
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
