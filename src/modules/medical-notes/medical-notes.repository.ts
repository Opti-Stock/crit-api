import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/app-error.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import type { CreateMedicalNoteInput, ListMedicalNotesInput, UpdateMedicalNoteInput } from "./medical-notes.validation.js";

export interface MedicalNoteSummary {
  id: string;
  appointmentId: string;
  attendanceRecordId: string | null;
  patient: { id: string; fullName: string };
  collaborator: { id: string; fullName: string };
  content: Record<string, unknown>;
  formatVersion: string;
  createdBy: { id: string; fullName: string };
  updatedBy: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface MedicalNoteRow {
  id: string;
  appointment_id: string;
  attendance_record_id: string | null;
  patient_id: string;
  patient_full_name: string;
  collaborator_id: string;
  collaborator_full_name: string;
  content: Record<string, unknown>;
  format_version: string;
  created_by_user_id: string;
  created_by_full_name: string;
  updated_by_user_id: string | null;
  updated_by_full_name: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_MEDICAL_NOTE = `
  SELECT mn.id, mn.appointment_id, mn.attendance_record_id,
    mn.patient_id, p.full_name AS patient_full_name,
    mn.collaborator_id, co.full_name AS collaborator_full_name,
    mn.content, mn.format_version,
    mn.created_by_user_id, creator.full_name AS created_by_full_name,
    mn.updated_by_user_id, updater.full_name AS updated_by_full_name,
    mn.created_at, mn.updated_at
  FROM medical_notes mn
  JOIN patients p ON p.tenant_id = mn.tenant_id AND p.id = mn.patient_id
  JOIN collaborators co ON co.tenant_id = mn.tenant_id AND co.id = mn.collaborator_id
  JOIN users creator ON creator.tenant_id = mn.tenant_id AND creator.id = mn.created_by_user_id
  LEFT JOIN users updater ON updater.tenant_id = mn.tenant_id AND updater.id = mn.updated_by_user_id
`;

export class MedicalNotesRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async list(tenantId: string, actorId: string, input: ListMedicalNotesInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const filters = ["mn.tenant_id = $1", "mn.deleted_at IS NULL"];
      const values: unknown[] = [tenantId];

      if (input.patientId) {
        values.push(input.patientId);
        filters.push(`mn.patient_id = $${values.length}`);
      }
      if (input.collaboratorId) {
        values.push(input.collaboratorId);
        filters.push(`mn.collaborator_id = $${values.length}`);
      }

      const where = filters.join(" AND ");
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM medical_notes mn WHERE ${where}`,
        values
      );

      values.push(input.pageSize, (input.page - 1) * input.pageSize);
      const rows = await client.query<MedicalNoteRow>(
        `${SELECT_MEDICAL_NOTE}
         WHERE ${where}
         ORDER BY mn.created_at DESC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );

      return { notes: rows.rows.map(mapSummary), total: Number(count.rows[0]?.count ?? 0) };
    }, this.databasePool);
  }

  async findById(
    tenantId: string,
    actorId: string,
    medicalNoteId: string
  ): Promise<MedicalNoteSummary | null> {
    return withTenantTransaction({ tenantId, userId: actorId }, (client) =>
      this.findByIdWithClient(client, tenantId, medicalNoteId), this.databasePool);
  }

  async create(tenantId: string, actorId: string, input: CreateMedicalNoteInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const appointment = await client.query<{ patient_id: string; collaborator_id: string }>(
        `SELECT patient_id, collaborator_id FROM appointments
         WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [tenantId, input.appointmentId]
      );
      const appointmentRow = appointment.rows[0];
      if (!appointmentRow) throw new NotFoundError("Appointment not found", "APPOINTMENT_NOT_FOUND");

      const ownCollaboratorId = await this.resolveOwnCollaboratorId(client, tenantId, actorId);
      if (ownCollaboratorId !== appointmentRow.collaborator_id) {
        throw new ForbiddenError(
          "You can only write a medical note for your own appointments",
          "MEDICAL_NOTE_NOT_OWNED"
        );
      }

      const attendance = await client.query<{ id: string }>(
        `SELECT id FROM attendance_records
         WHERE tenant_id = $1 AND appointment_id = $2 AND deleted_at IS NULL`,
        [tenantId, input.appointmentId]
      );
      const attendanceRecordId = attendance.rows[0]?.id ?? null;

      try {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO medical_notes (
             tenant_id, attendance_record_id, appointment_id, patient_id, collaborator_id,
             content, format_version, created_by_user_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            tenantId,
            attendanceRecordId,
            input.appointmentId,
            appointmentRow.patient_id,
            appointmentRow.collaborator_id,
            input.content,
            input.formatVersion,
            actorId
          ]
        );
        return (await this.findByIdWithClient(client, tenantId, inserted.rows[0]!.id))!;
      } catch (error) {
        throw mapDatabaseError(error);
      }
    }, this.databasePool);
  }

  async update(tenantId: string, actorId: string, medicalNoteId: string, input: UpdateMedicalNoteInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const current = await client.query<{ collaborator_id: string }>(
        `SELECT collaborator_id
         FROM medical_notes
         WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [tenantId, medicalNoteId]
      );
      const currentRow = current.rows[0];
      if (!currentRow) throw new NotFoundError("Medical note not found", "MEDICAL_NOTE_NOT_FOUND");

      const ownCollaboratorId = await this.resolveOwnCollaboratorId(client, tenantId, actorId);
      if (ownCollaboratorId !== currentRow.collaborator_id) {
        throw new ForbiddenError(
          "You can only update a medical note for your own appointments",
          "MEDICAL_NOTE_NOT_OWNED"
        );
      }

      try {
        await client.query(
          `UPDATE medical_notes
           SET content = COALESCE($3::jsonb, content),
               format_version = COALESCE($4, format_version),
               updated_by_user_id = $5
           WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [tenantId, medicalNoteId, input.content ?? null, input.formatVersion ?? null, actorId]
        );
        return (await this.findByIdWithClient(client, tenantId, medicalNoteId))!;
      } catch (error) {
        throw mapDatabaseError(error);
      }
    }, this.databasePool);
  }

  private async findByIdWithClient(client: PoolClient, tenantId: string, medicalNoteId: string) {
    const result = await client.query<MedicalNoteRow>(
      `${SELECT_MEDICAL_NOTE} WHERE mn.tenant_id = $1 AND mn.id = $2 AND mn.deleted_at IS NULL`,
      [tenantId, medicalNoteId]
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
}

function mapSummary(row: MedicalNoteRow): MedicalNoteSummary {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    attendanceRecordId: row.attendance_record_id,
    patient: { id: row.patient_id, fullName: row.patient_full_name },
    collaborator: { id: row.collaborator_id, fullName: row.collaborator_full_name },
    content: row.content,
    formatVersion: row.format_version,
    createdBy: { id: row.created_by_user_id, fullName: row.created_by_full_name },
    updatedBy: row.updated_by_user_id
      ? { id: row.updated_by_user_id, fullName: row.updated_by_full_name! }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDatabaseError(error: unknown): Error {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;

  if (code === "23505") {
    return new ConflictError("A medical note already exists for this appointment", "MEDICAL_NOTE_CONFLICT");
  }
  if (code === "23503" || code === "23514") {
    return new BadRequestError("Medical note violates a data constraint", "INVALID_MEDICAL_NOTE_DATA");
  }
  return error instanceof Error ? error : new Error("Unknown database error");
}
