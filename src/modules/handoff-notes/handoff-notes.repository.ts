import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../shared/errors/app-error.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import { insertNotification } from "../notifications/notifications.repository.js";
import type { CreateHandoffNoteInput, ListHandoffNotesInput } from "./handoff-notes.validation.js";

const VALID_RECIPIENT_ROLES = ["admin", "medico", "terapeuta"];

export interface HandoffNoteRecipient {
  userId: string;
  fullName: string;
  readAt: string | null;
}

export interface HandoffNoteSummary {
  id: string;
  patient: { id: string; fullName: string };
  appointmentId: string | null;
  createdBy: { id: string; fullName: string };
  title: string;
  content: string;
  priority: string;
  status: string;
  recipients: HandoffNoteRecipient[];
  createdAt: string;
}

interface HandoffNoteRow {
  id: string;
  patient_id: string;
  patient_full_name: string;
  appointment_id: string | null;
  created_by_user_id: string;
  created_by_full_name: string;
  title: string;
  content: string;
  priority: string;
  status: string;
  recipients: HandoffNoteRecipient[];
  created_at: string;
}

const SELECT_HANDOFF_NOTE = `
  SELECT hn.id, hn.patient_id, p.full_name AS patient_full_name, hn.appointment_id,
    hn.created_by_user_id, creator.full_name AS created_by_full_name,
    hn.title, hn.content, hn.priority, hn.status, hn.created_at,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('userId', u.id, 'fullName', u.full_name, 'readAt', hnr.read_at) ORDER BY u.full_name)
       FROM handoff_note_recipients hnr JOIN users u ON u.tenant_id = hnr.tenant_id AND u.id = hnr.user_id
       WHERE hnr.tenant_id = hn.tenant_id AND hnr.handoff_note_id = hn.id),
      '[]'
    ) AS recipients
  FROM handoff_notes hn
  JOIN patients p ON p.tenant_id = hn.tenant_id AND p.id = hn.patient_id
  JOIN users creator ON creator.tenant_id = hn.tenant_id AND creator.id = hn.created_by_user_id
`;

function visibilityClause(actorParam: string): string {
  return `
    (hn.created_by_user_id = ${actorParam}
     OR EXISTS (
       SELECT 1 FROM handoff_note_recipients hnr
       WHERE hnr.tenant_id = hn.tenant_id AND hnr.handoff_note_id = hn.id AND hnr.user_id = ${actorParam}
     ))
  `;
}

export class HandoffNotesRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async list(tenantId: string, actorId: string, actorRoles: string[], input: ListHandoffNotesInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const filters = ["hn.tenant_id = $1", "hn.deleted_at IS NULL"];
      const values: unknown[] = [tenantId];
      if (!this.canReadTenantWide(actorRoles)) {
        values.push(actorId);
        filters.push(visibilityClause(`$${values.length}`));
      }

      if (input.status) {
        values.push(input.status);
        filters.push(`hn.status = $${values.length}`);
      }
      if (input.priority) {
        values.push(input.priority);
        filters.push(`hn.priority = $${values.length}`);
      }

      const where = filters.join(" AND ");
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM handoff_notes hn WHERE ${where}`,
        values
      );

      values.push(input.pageSize, (input.page - 1) * input.pageSize);
      const rows = await client.query<HandoffNoteRow>(
        `${SELECT_HANDOFF_NOTE}
         WHERE ${where}
         ORDER BY hn.created_at DESC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );

      return { notes: rows.rows.map(mapSummary), total: Number(count.rows[0]?.count ?? 0) };
    }, this.databasePool);
  }

  async findById(
    tenantId: string,
    actorId: string,
    actorRoles: string[],
    handoffNoteId: string
  ): Promise<HandoffNoteSummary | null> {
    return withTenantTransaction({ tenantId, userId: actorId }, (client) =>
      this.findByIdWithClient(client, tenantId, actorId, actorRoles, handoffNoteId), this.databasePool);
  }

  async create(tenantId: string, actorId: string, input: CreateHandoffNoteInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const recipientIds = [...new Set(input.recipientUserIds)];
      await this.assertValidRecipients(client, tenantId, recipientIds);

      try {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO handoff_notes (
             tenant_id, patient_id, appointment_id, created_by_user_id, title, content, priority
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            tenantId,
            input.patientId,
            input.appointmentId ?? null,
            actorId,
            input.title,
            input.content,
            input.priority
          ]
        );
        const handoffNoteId = inserted.rows[0]!.id;

        await client.query(
          `INSERT INTO handoff_note_recipients (tenant_id, handoff_note_id, user_id)
           SELECT $1, $2, unnest($3::uuid[])`,
          [tenantId, handoffNoteId, recipientIds]
        );

        for (const recipientId of recipientIds) {
          await insertNotification(client, {
            tenantId,
            userId: recipientId,
            type: "handoff_note_received",
            title: "Nueva nota de enlace",
            message: input.title
          });
        }

        return (await this.findByIdWithClient(client, tenantId, actorId, [], handoffNoteId))!;
      } catch (error) {
        throw mapDatabaseError(error);
      }
    }, this.databasePool);
  }

  async markAsRead(tenantId: string, actorId: string, handoffNoteId: string) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const recipient = await client.query(
        `SELECT 1 FROM handoff_note_recipients
         WHERE tenant_id = $1 AND handoff_note_id = $2 AND user_id = $3`,
        [tenantId, handoffNoteId, actorId]
      );
      if (recipient.rowCount === 0) {
        const note = await client.query(
          `SELECT 1 FROM handoff_notes WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [tenantId, handoffNoteId]
        );
        if (note.rowCount === 0) throw new NotFoundError("Handoff note not found", "HANDOFF_NOTE_NOT_FOUND");
        throw new ForbiddenError("You are not a recipient of this note", "HANDOFF_NOTE_NOT_RECIPIENT");
      }

      await client.query(
        `UPDATE handoff_note_recipients SET read_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND handoff_note_id = $2 AND user_id = $3 AND read_at IS NULL`,
        [tenantId, handoffNoteId, actorId]
      );
      await client.query(
        `UPDATE handoff_notes SET status = 'read'
         WHERE tenant_id = $1 AND id = $2 AND status = 'pending'`,
        [tenantId, handoffNoteId]
      );

      return (await this.findByIdWithClient(client, tenantId, actorId, [], handoffNoteId))!;
    }, this.databasePool);
  }

  private async findByIdWithClient(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    actorRoles: string[],
    handoffNoteId: string
  ) {
    const values: unknown[] = [tenantId, handoffNoteId];
    const visibility = this.canReadTenantWide(actorRoles)
      ? "TRUE"
      : visibilityClause(`$${values.push(actorId)}`);
    const result = await client.query<HandoffNoteRow>(
      `${SELECT_HANDOFF_NOTE}
       WHERE hn.tenant_id = $1 AND hn.id = $2 AND hn.deleted_at IS NULL AND ${visibility}`,
      values
    );
    return result.rows[0] ? mapSummary(result.rows[0]) : null;
  }

  private canReadTenantWide(actorRoles: string[]) {
    return actorRoles.some((role) => role === "admin" || role === "direccion");
  }

  private async assertValidRecipients(client: PoolClient, tenantId: string, recipientIds: string[]) {
    const result = await client.query<{ count: string }>(
      `SELECT count(DISTINCT u.id)::text AS count
       FROM users u
       JOIN user_roles ur ON ur.tenant_id = u.tenant_id AND ur.user_id = u.id
       JOIN roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
       WHERE u.tenant_id = $1 AND u.id = ANY($2::uuid[]) AND u.deleted_at IS NULL
         AND r.name = ANY($3::varchar[]) AND r.deleted_at IS NULL`,
      [tenantId, recipientIds, VALID_RECIPIENT_ROLES]
    );
    if (Number(result.rows[0]?.count) !== recipientIds.length) {
      throw new BadRequestError(
        "All recipients must hold the admin, medico, or terapeuta role",
        "INVALID_RECIPIENT"
      );
    }
  }
}

function mapSummary(row: HandoffNoteRow): HandoffNoteSummary {
  return {
    id: row.id,
    patient: { id: row.patient_id, fullName: row.patient_full_name },
    appointmentId: row.appointment_id,
    createdBy: { id: row.created_by_user_id, fullName: row.created_by_full_name },
    title: row.title,
    content: row.content,
    priority: row.priority,
    status: row.status,
    recipients: row.recipients,
    createdAt: row.created_at
  };
}

function mapDatabaseError(error: unknown): Error {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
  if (code === "23503" || code === "23514") {
    return new BadRequestError("Handoff note violates a data constraint", "INVALID_HANDOFF_NOTE_DATA");
  }
  return error instanceof Error ? error : new Error("Unknown database error");
}
