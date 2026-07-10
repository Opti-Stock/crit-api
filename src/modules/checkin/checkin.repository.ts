import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/app-error.js";
import type { ListCheckinAppointmentsInput, ScanCheckinInput } from "./checkin.validation.js";

export interface CheckinAppointmentSummary {
  id: string;
  patient: { id: string; fullName: string };
  collaborator: { id: string; fullName: string };
  clinic: { id: string; name: string };
  room: { id: string; name: string };
  startsAt: string;
  endsAt: string;
  status: string;
  attendanceStatus: string | null;
  checkInStatus: "checked_in" | "not_checked_in";
  isCheckedIn: boolean;
  checkedInAt: string | null;
  attendance: {
    id: string;
    status: string;
    checkedAt: string | null;
  } | null;
}

export interface ScanCheckinResult {
  patient: { id: string; fullName: string; externalId: string | null };
  checkedIn: boolean;
  alreadyCheckedIn: boolean;
  scanStatus:
    | "checkin_registered"
    | "already_checked_in"
    | "no_appointments_today"
    | "therapeutic_match"
    | "therapeutic_no_appointments";
  appointments: CheckinAppointmentSummary[];
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
  check_in_id: string | null;
  checked_in_at: string | null;
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
    aci.id AS check_in_id, aci.checked_in_at,
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
  LEFT JOIN appointment_check_ins aci
    ON aci.tenant_id = a.tenant_id
   AND aci.appointment_id = a.id
   AND aci.deleted_at IS NULL
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
      if (input.checkInStatus === "checked_in") {
        filters.push("aci.id IS NOT NULL");
      }
      if (input.checkInStatus === "not_checked_in") {
        filters.push("aci.id IS NULL");
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
    appointmentId: string
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const appointment = await client.query<{
        patient_id: string;
        collaborator_id: string;
        clinic_id: string;
        starts_at: string;
      }>(
        `SELECT patient_id, collaborator_id, clinic_id, starts_at
         FROM appointments
         WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [tenantId, appointmentId]
      );
      const appointmentRow = appointment.rows[0];
      if (!appointmentRow) throw new NotFoundError("Appointment not found", "APPOINTMENT_NOT_FOUND");
      await this.assertCanAccessClinic(client, tenantId, actorId, actorRoles, appointmentRow.clinic_id);

      const existingForDay = await client.query<{ id: string }>(
        `SELECT aci.id
         FROM appointment_check_ins aci
         JOIN appointments a ON a.tenant_id = aci.tenant_id AND a.id = aci.appointment_id
         WHERE aci.tenant_id = $1
           AND aci.patient_id = $2
           AND aci.deleted_at IS NULL
           AND a.starts_at >= $3::timestamptz::date
           AND a.starts_at < ($3::timestamptz::date + INTERVAL '1 day')
         LIMIT 1`,
        [tenantId, appointmentRow.patient_id, appointmentRow.starts_at]
      );
      if (existingForDay.rows[0]) {
        throw new ConflictError("Patient already has check-in for this day", "CHECKIN_ALREADY_REGISTERED");
      }

      await client.query(
        `INSERT INTO appointment_check_ins (
           tenant_id, appointment_id, patient_id, checked_in_by_user_id
         )
         SELECT a.tenant_id, a.id, a.patient_id, $3
         FROM appointments a
         WHERE a.tenant_id = $1
           AND a.patient_id = $2
           AND a.deleted_at IS NULL
           AND a.status IN ('scheduled', 'rescheduled')
           AND a.starts_at >= $4::timestamptz::date
           AND a.starts_at < ($4::timestamptz::date + INTERVAL '1 day')
         ON CONFLICT (tenant_id, appointment_id) DO NOTHING`,
        [
          tenantId,
          appointmentRow.patient_id,
          actorId,
          appointmentRow.starts_at
        ]
      );

      return this.getAppointmentWithClient(client, tenantId, appointmentId);
    }, this.databasePool);
  }

  scanCheckIn(
    tenantId: string,
    actorId: string,
    actorRoles: string[],
    input: ScanCheckinInput
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const badgeCode = input.code.replace(/[\x00-\x1F\x7F]/g, "").trim();
      const badgeCodeLookup = badgeCode.toUpperCase();
      const patient = await client.query<{ id: string; full_name: string; external_id: string | null }>(
        `SELECT id, full_name, external_id
         FROM patients
         WHERE tenant_id = $1
           AND deleted_at IS NULL
           AND status = 'active'
           AND (
             upper(id::text) = $2
             OR upper(external_id) = $2
             OR full_name ILIKE $3
           )
         ORDER BY CASE WHEN upper(external_id) = $2 OR upper(id::text) = $2 THEN 0 ELSE 1 END, full_name
         LIMIT 1`,
        [tenantId, badgeCodeLookup, `%${badgeCode}%`]
      );
      const patientRow = patient.rows[0];
      if (!patientRow) throw new NotFoundError("Patient not found for badge", "CHECKIN_PATIENT_NOT_FOUND");

      const date = input.date ?? new Date().toISOString().slice(0, 10);
      const appointmentFilters = ["a.tenant_id = $1", "a.patient_id = $2", "a.deleted_at IS NULL"];
      const values: unknown[] = [tenantId, patientRow.id];
      await this.appendAccessFilter(client, tenantId, actorId, actorRoles, values, appointmentFilters);
      values.push(date);
      appointmentFilters.push(`a.starts_at >= $${values.length}::date`);
      appointmentFilters.push(`a.starts_at < ($${values.length}::date + INTERVAL '1 day')`);

      const appointments = await client.query<CheckinAppointmentRow>(
        `${SELECT_CHECKIN_APPOINTMENT}
         WHERE ${appointmentFilters.join(" AND ")}
         ORDER BY a.starts_at, p.full_name`,
        values
      );
      const mode = input.mode ?? "reception-checkin";
      const appointmentSummaries = appointments.rows.map(mapAppointment);

      if (mode === "therapeutic-attendance") {
        return {
          patient: { id: patientRow.id, fullName: patientRow.full_name, externalId: patientRow.external_id },
          checkedIn: appointmentSummaries.some((appointment) => appointment.isCheckedIn),
          alreadyCheckedIn: appointmentSummaries.some((appointment) => appointment.isCheckedIn),
          scanStatus: appointmentSummaries.length > 0 ? "therapeutic_match" : "therapeutic_no_appointments",
          appointments: appointmentSummaries
        };
      }

      if (appointments.rows.length === 0) {
        return {
          patient: { id: patientRow.id, fullName: patientRow.full_name, externalId: patientRow.external_id },
          checkedIn: false,
          alreadyCheckedIn: false,
          scanStatus: "no_appointments_today",
          appointments: []
        };
      }

      const alreadyCheckedIn = appointmentSummaries.some((appointment) => appointment.isCheckedIn);
      if (!alreadyCheckedIn) {
        await client.query(
          `INSERT INTO appointment_check_ins (
             tenant_id, appointment_id, patient_id, checked_in_by_user_id
           )
           SELECT a.tenant_id, a.id, a.patient_id, $3
           FROM appointments a
           WHERE a.tenant_id = $1
             AND a.patient_id = $2
             AND a.deleted_at IS NULL
             AND a.status IN ('scheduled', 'rescheduled')
             AND a.starts_at >= $4::date
             AND a.starts_at < ($4::date + INTERVAL '1 day')
           ON CONFLICT (tenant_id, appointment_id) DO NOTHING`,
          [tenantId, patientRow.id, actorId, date]
        );
      }

      const refreshed = await client.query<CheckinAppointmentRow>(
        `${SELECT_CHECKIN_APPOINTMENT}
         WHERE ${appointmentFilters.join(" AND ")}
         ORDER BY a.starts_at, p.full_name`,
        values
      );

      return {
        patient: { id: patientRow.id, fullName: patientRow.full_name, externalId: patientRow.external_id },
        checkedIn: true,
        alreadyCheckedIn,
        scanStatus: alreadyCheckedIn ? "already_checked_in" : "checkin_registered",
        appointments: refreshed.rows.map(mapAppointment)
      };
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
    return actorRoles.some((role) => role === "admin" || role === "direccion" || role === "recepcion_general");
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
    attendanceStatus: row.attendance_status,
    checkInStatus: row.check_in_id ? "checked_in" : "not_checked_in",
    isCheckedIn: Boolean(row.check_in_id),
    checkedInAt: row.checked_in_at,
    attendance: row.attendance_id
      ? {
          id: row.attendance_id,
          status: row.attendance_status!,
          checkedAt: row.checked_at
        }
      : null
  };
}
