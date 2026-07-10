import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import type { OperationalAccessScope } from "../../shared/access/operational-access-scope.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/app-error.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import { insertAttendanceRegisteredEvent } from "../../integrations/crit-post-api/crit-post-api.payload.js";
import { insertNotification } from "../notifications/notifications.repository.js";
import type { CreateAttendanceInput, ListAttendanceInput, UpdateAttendanceInput } from "./attendance.validation.js";

export interface AttendanceSummary {
  id: string;
  appointmentId: string;
  patient: { id: string; fullName: string };
  collaborator: { id: string; fullName: string };
  status: string;
  checkedAt: string | null;
  checkedBy: { id: string; fullName: string } | null;
  notesRequired: boolean;
}

interface AttendanceRow {
  id: string;
  appointment_id: string;
  patient_id: string;
  patient_full_name: string;
  collaborator_id: string;
  collaborator_full_name: string;
  status: string;
  checked_at: string | null;
  checked_by_user_id: string | null;
  checked_by_full_name: string | null;
  notes_required: boolean;
}

interface AttendanceAppointmentRow {
  id: string;
  patient_id: string;
  patient_full_name: string;
  collaborator_id: string;
  collaborator_full_name: string;
  clinic_id: string;
  starts_at: string | Date;
}

interface AttendanceRecordForUpdateRow extends AttendanceAppointmentRow {
  appointment_id: string;
  status: string;
}

const SELECT_ATTENDANCE = `
  SELECT ar.id, ar.appointment_id,
    ar.patient_id, p.full_name AS patient_full_name,
    ar.collaborator_id, co.full_name AS collaborator_full_name,
    ar.status, ar.checked_at, ar.checked_by_user_id, u.full_name AS checked_by_full_name,
    ar.notes_required
  FROM attendance_records ar
  JOIN patients p ON p.tenant_id = ar.tenant_id AND p.id = ar.patient_id
  JOIN collaborators co ON co.tenant_id = ar.tenant_id AND co.id = ar.collaborator_id
  LEFT JOIN users u ON u.tenant_id = ar.tenant_id AND u.id = ar.checked_by_user_id
`;

export class AttendanceRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async list(
    tenantId: string,
    actorId: string,
    input: ListAttendanceInput,
    scope: OperationalAccessScope
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const joins = ["JOIN appointments a ON a.tenant_id = ar.tenant_id AND a.id = ar.appointment_id"];
      const filters = ["ar.tenant_id = $1", "ar.deleted_at IS NULL"];
      const values: unknown[] = [tenantId];

      const hasAccess = await this.appendAccessFilter(
        client,
        tenantId,
        actorId,
        scope,
        values,
        filters
      );
      if (!hasAccess) return { records: [], total: 0 };

      if (input.clinicId) {
        values.push(input.clinicId);
        filters.push(`a.clinic_id = $${values.length}`);
      }
      if (input.patientId) {
        values.push(input.patientId);
        filters.push(`ar.patient_id = $${values.length}`);
      }
      if (input.collaboratorId) {
        values.push(input.collaboratorId);
        filters.push(`ar.collaborator_id = $${values.length}`);
      }
      if (input.status) {
        values.push(input.status);
        filters.push(`ar.status = $${values.length}`);
      }
      if (input.from) {
        values.push(input.from);
        filters.push(`a.starts_at >= $${values.length}`);
      }
      if (input.to) {
        values.push(input.to);
        filters.push(`a.starts_at <= $${values.length}`);
      }

      const join = joins.join(" ");
      const where = filters.join(" AND ");
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM attendance_records ar ${join} WHERE ${where}`,
        values
      );

      values.push(input.pageSize, (input.page - 1) * input.pageSize);
      const rows = await client.query<AttendanceRow>(
        `${SELECT_ATTENDANCE}
         ${join}
         WHERE ${where}
         ORDER BY a.starts_at
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );

      return { records: rows.rows.map(mapSummary), total: Number(count.rows[0]?.count ?? 0) };
    }, this.databasePool);
  }

  async findById(
    tenantId: string,
    actorId: string,
    attendanceId: string,
    scope: OperationalAccessScope
  ): Promise<AttendanceSummary | null> {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const filters = ["ar.tenant_id = $1", "ar.id = $2", "ar.deleted_at IS NULL"];
      const values: unknown[] = [tenantId, attendanceId];
      const hasAccess = await this.appendAccessFilter(
        client,
        tenantId,
        actorId,
        scope,
        values,
        filters
      );
      if (!hasAccess) return null;
      return this.findByFilters(client, filters, values, true);
    }, this.databasePool);
  }

  async create(
    tenantId: string,
    actorId: string,
    actorRoles: string[],
    input: CreateAttendanceInput
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const appointment = await client.query<AttendanceAppointmentRow>(
        `SELECT a.id, a.patient_id, p.full_name AS patient_full_name,
                a.collaborator_id, c.full_name AS collaborator_full_name,
                a.clinic_id, a.starts_at
         FROM appointments a
         JOIN patients p ON p.tenant_id = a.tenant_id AND p.id = a.patient_id
         JOIN collaborators c ON c.tenant_id = a.tenant_id AND c.id = a.collaborator_id
         WHERE a.tenant_id = $1 AND a.id = $2 AND a.deleted_at IS NULL`,
        [tenantId, input.appointmentId]
      );
      const appointmentRow = appointment.rows[0];
      if (!appointmentRow) throw new NotFoundError("Appointment not found", "APPOINTMENT_NOT_FOUND");

      const isTenantWide = actorRoles.some((role) => role === "admin" || role === "direccion");
      if (!isTenantWide) {
        const ownCollaboratorId = await this.resolveOwnCollaboratorId(client, tenantId, actorId);
        if (ownCollaboratorId !== appointmentRow.collaborator_id) {
          throw new ForbiddenError(
            "You can only register attendance for your own appointments",
            "ATTENDANCE_NOT_OWNED"
          );
        }
      }

      try {
        const inserted = await client.query<{ id: string; checked_at: Date | string }>(
          `INSERT INTO attendance_records (
             tenant_id, appointment_id, patient_id, collaborator_id,
             checked_by_user_id, status, checked_at, notes_required
           ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
           RETURNING id, checked_at`,
          [
            tenantId,
            input.appointmentId,
            appointmentRow.patient_id,
            appointmentRow.collaborator_id,
            actorId,
            input.status,
            input.notesRequired
          ]
        );
        const attendance = inserted.rows[0]!;

        await insertAttendanceRegisteredEvent(client, {
          tenantId,
          attendanceId: attendance.id,
          appointmentId: input.appointmentId,
          patientId: appointmentRow.patient_id,
          collaboratorId: appointmentRow.collaborator_id,
          status: input.status,
          checkedAt: toIsoString(attendance.checked_at)
        });

        if (input.notesRequired) {
          await insertNotification(client, {
            tenantId,
            userId: actorId,
            type: "pending_note",
            title: "Nota médica pendiente",
            message: "Esta asistencia quedó marcada como pendiente de nota médica."
          });
        }

        if (input.status === "rescheduled") {
          await notifyReceptionRescheduleRequest(client, {
            tenantId,
            actorId,
            appointment: appointmentRow
          });
        }

        return (await this.findByIdWithClient(client, tenantId, attendance.id))!;
      } catch (error) {
        throw mapDatabaseError(error);
      }
    }, this.databasePool);
  }

  async update(
    tenantId: string,
    actorId: string,
    actorRoles: string[],
    attendanceId: string,
    input: UpdateAttendanceInput
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const current = await client.query<AttendanceRecordForUpdateRow>(
        `SELECT a.id, ar.appointment_id, ar.collaborator_id, ar.status,
                a.patient_id, p.full_name AS patient_full_name,
                c.full_name AS collaborator_full_name,
                a.clinic_id, a.starts_at
         FROM attendance_records ar
         JOIN appointments a ON a.tenant_id = ar.tenant_id AND a.id = ar.appointment_id
         JOIN patients p ON p.tenant_id = ar.tenant_id AND p.id = ar.patient_id
         JOIN collaborators c ON c.tenant_id = ar.tenant_id AND c.id = ar.collaborator_id
         WHERE ar.tenant_id = $1 AND ar.id = $2 AND ar.deleted_at IS NULL`,
        [tenantId, attendanceId]
      );
      const currentRow = current.rows[0];
      if (!currentRow) throw new NotFoundError("Attendance record not found", "ATTENDANCE_NOT_FOUND");

      const isTenantWide = actorRoles.some((role) => role === "admin" || role === "direccion");
      if (!isTenantWide) {
        const ownCollaboratorId = await this.resolveOwnCollaboratorId(client, tenantId, actorId);
        if (ownCollaboratorId !== currentRow.collaborator_id) {
          throw new ForbiddenError(
            "You can only update attendance for your own appointments",
            "ATTENDANCE_NOT_OWNED"
          );
        }
      }

      try {
        await client.query(
          `UPDATE attendance_records
           SET status = COALESCE($3, status),
               checked_by_user_id = CASE
                 WHEN COALESCE($3, status) = 'pending' THEN checked_by_user_id
                 ELSE $4
               END,
               checked_at = CASE
                 WHEN COALESCE($3, status) = 'pending' THEN NULL
                 WHEN $3 IS NULL THEN checked_at
                 ELSE CURRENT_TIMESTAMP
               END,
               notes_required = COALESCE($5, notes_required)
           WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [tenantId, attendanceId, input.status ?? null, actorId, input.notesRequired ?? null]
        );

        if (input.status === "rescheduled" && currentRow.status !== "rescheduled") {
          await notifyReceptionRescheduleRequest(client, {
            tenantId,
            actorId,
            appointment: {
              id: currentRow.appointment_id,
              patient_id: currentRow.patient_id,
              patient_full_name: currentRow.patient_full_name,
              collaborator_id: currentRow.collaborator_id,
              collaborator_full_name: currentRow.collaborator_full_name,
              clinic_id: currentRow.clinic_id,
              starts_at: currentRow.starts_at
            }
          });
        }

        return (await this.findByIdWithClient(client, tenantId, attendanceId))!;
      } catch (error) {
        throw mapDatabaseError(error);
      }
    }, this.databasePool);
  }

  private async findByIdWithClient(client: PoolClient, tenantId: string, attendanceId: string) {
    return this.findByFilters(
      client,
      ["ar.tenant_id = $1", "ar.id = $2", "ar.deleted_at IS NULL"],
      [tenantId, attendanceId],
      false
    );
  }

  private async findByFilters(
    client: PoolClient,
    filters: string[],
    values: unknown[],
    joinAppointments: boolean
  ) {
    const appointmentJoin = joinAppointments
      ? "JOIN appointments a ON a.tenant_id = ar.tenant_id AND a.id = ar.appointment_id"
      : "";
    const result = await client.query<AttendanceRow>(
      `${SELECT_ATTENDANCE} ${appointmentJoin} WHERE ${filters.join(" AND ")}`,
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
        accessClauses.push(`ar.collaborator_id = $${values.length}`);
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

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function notifyReceptionRescheduleRequest(
  client: PoolClient,
  input: {
    tenantId: string;
    actorId: string;
    appointment: AttendanceAppointmentRow;
  }
): Promise<void> {
  const recipients = await client.query<{ id: string }>(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_roles ur
       ON ur.tenant_id = u.tenant_id
      AND ur.user_id = u.id
     JOIN roles r
       ON r.tenant_id = ur.tenant_id
      AND r.id = ur.role_id
      AND r.deleted_at IS NULL
     LEFT JOIN user_clinic_access uca
       ON uca.tenant_id = u.tenant_id
      AND uca.user_id = u.id
      AND uca.clinic_id = $2
     WHERE u.tenant_id = $1
       AND u.status = 'active'
       AND u.deleted_at IS NULL
       AND (
         r.name = 'recepcion_general'
         OR (r.name = 'recepcion' AND uca.clinic_id IS NOT NULL)
       )`,
    [input.tenantId, input.appointment.clinic_id]
  );

  const startsAt = toIsoString(input.appointment.starts_at);
  for (const recipient of recipients.rows) {
    await insertNotification(client, {
      tenantId: input.tenantId,
      userId: recipient.id,
      actorId: input.actorId,
      type: "appointment_change",
      title: "Solicitud de reagendar cita",
      message: `${input.appointment.collaborator_full_name} solicito reagendar la cita de ${input.appointment.patient_full_name}.`,
      metadata: {
        target: {
          type: "appointment",
          entityId: input.appointment.id,
          patientId: input.appointment.patient_id
        },
        patient: {
          id: input.appointment.patient_id,
          fullName: input.appointment.patient_full_name
        },
        appointment: {
          id: input.appointment.id,
          startsAt,
          clinicId: input.appointment.clinic_id
        },
        requestedBy: {
          userId: input.actorId,
          collaboratorId: input.appointment.collaborator_id,
          fullName: input.appointment.collaborator_full_name
        },
        requestedAction: "reschedule"
      }
    });
  }
}

function mapSummary(row: AttendanceRow): AttendanceSummary {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    patient: { id: row.patient_id, fullName: row.patient_full_name },
    collaborator: { id: row.collaborator_id, fullName: row.collaborator_full_name },
    status: row.status,
    checkedAt: row.checked_at,
    checkedBy: row.checked_by_user_id
      ? { id: row.checked_by_user_id, fullName: row.checked_by_full_name! }
      : null,
    notesRequired: row.notes_required
  };
}

function mapDatabaseError(error: unknown): Error {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;

  if (code === "23505") {
    return new ConflictError("Attendance is already registered for this appointment", "ATTENDANCE_CONFLICT");
  }
  if (code === "23503" || code === "23514") {
    return new BadRequestError("Attendance violates a data constraint", "INVALID_ATTENDANCE_DATA");
  }
  return error instanceof Error ? error : new Error("Unknown database error");
}
