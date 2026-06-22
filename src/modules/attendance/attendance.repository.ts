import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/app-error.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import { insertNotification } from "../notifications/notifications.repository.js";
import type { CreateAttendanceInput, ListAttendanceInput } from "./attendance.validation.js";

export type AttendanceAccessScope = { kind: "all" } | { kind: "clinics" } | { kind: "own-collaborator" };

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
    scope: AttendanceAccessScope
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const joins = ["JOIN appointments a ON a.tenant_id = ar.tenant_id AND a.id = ar.appointment_id"];
      const filters = ["ar.tenant_id = $1", "ar.deleted_at IS NULL"];
      const values: unknown[] = [tenantId];

      if (scope.kind === "own-collaborator") {
        const collaboratorId = await this.resolveOwnCollaboratorId(client, tenantId, actorId);
        if (!collaboratorId) return { records: [], total: 0 };
        values.push(collaboratorId);
        filters.push(`ar.collaborator_id = $${values.length}`);
      } else if (scope.kind === "clinics") {
        const clinicIds = await this.resolveAccessibleClinicIds(client, tenantId, actorId);
        if (clinicIds.length === 0) return { records: [], total: 0 };
        values.push(clinicIds);
        filters.push(`a.clinic_id = ANY($${values.length}::uuid[])`);
      }

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
    attendanceId: string
  ): Promise<AttendanceSummary | null> {
    return withTenantTransaction({ tenantId, userId: actorId }, (client) =>
      this.findByIdWithClient(client, tenantId, attendanceId), this.databasePool);
  }

  async create(
    tenantId: string,
    actorId: string,
    actorRoles: string[],
    input: CreateAttendanceInput
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const appointment = await client.query<{ patient_id: string; collaborator_id: string }>(
        `SELECT patient_id, collaborator_id FROM appointments
         WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
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
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO attendance_records (
             tenant_id, appointment_id, patient_id, collaborator_id,
             checked_by_user_id, status, checked_at, notes_required
           ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
           RETURNING id`,
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

        if (input.notesRequired) {
          await insertNotification(client, {
            tenantId,
            userId: actorId,
            type: "pending_note",
            title: "Nota médica pendiente",
            message: "Esta asistencia quedó marcada como pendiente de nota médica."
          });
        }

        return (await this.findByIdWithClient(client, tenantId, inserted.rows[0]!.id))!;
      } catch (error) {
        throw mapDatabaseError(error);
      }
    }, this.databasePool);
  }

  private async findByIdWithClient(client: PoolClient, tenantId: string, attendanceId: string) {
    const result = await client.query<AttendanceRow>(
      `${SELECT_ATTENDANCE} WHERE ar.tenant_id = $1 AND ar.id = $2 AND ar.deleted_at IS NULL`,
      [tenantId, attendanceId]
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
