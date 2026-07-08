import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import { BadRequestError, NotFoundError } from "../../shared/errors/app-error.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import type { CreateNotificationInput, ListNotificationsInput } from "./notifications.validation.js";

export interface NotificationSummary {
  id: string;
  type: string;
  title: string;
  message: string;
  target: {
    type?: string;
    patientId?: string;
    handoffNoteId?: string;
    noteId?: string;
    entityId?: string;
  } | null;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  patient_id: string | null;
  patient_full_name: string | null;
  read_at: string | null;
  created_at: string;
}

const UUID_PATTERN = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";

const SELECT_NOTIFICATION = `
  SELECT n.id, n.type, n.title, n.message, n.metadata,
         patient_lookup.patient_id,
         p.full_name AS patient_full_name,
         n.read_at, n.created_at
  FROM notifications n
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      n.metadata #>> '{patient,id}',
      n.metadata #>> '{target,patientId}',
      n.metadata ->> 'patientId'
    ) AS patient_id
  ) patient_lookup ON TRUE
  LEFT JOIN patients p
    ON p.tenant_id = n.tenant_id
   AND p.deleted_at IS NULL
   AND patient_lookup.patient_id ~* '${UUID_PATTERN}'
   AND p.id = patient_lookup.patient_id::uuid
`;

/**
 * Inserts a notification using an existing client/transaction so other
 * modules can raise one atomically alongside their own write
 * (e.g. handoff notes, attendance "notes required").
 */
export async function insertNotification(
  client: PoolClient,
  params: {
    tenantId: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO notifications (tenant_id, user_id, type, title, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.tenantId,
      params.userId,
      params.type,
      params.title,
      params.message,
      params.metadata ?? {}
    ]
  );
}

export class NotificationsRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async list(tenantId: string, actorId: string, input: ListNotificationsInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const filters = ["n.tenant_id = $1", "n.user_id = $2"];
      const values: unknown[] = [tenantId, actorId];

      if (input.status === "unread") filters.push("n.read_at IS NULL");
      if (input.status === "read") filters.push("n.read_at IS NOT NULL");

      const where = filters.join(" AND ");
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM notifications n WHERE ${where}`,
        values
      );

      values.push(input.pageSize, (input.page - 1) * input.pageSize);
      const rows = await client.query<NotificationRow>(
        `${SELECT_NOTIFICATION}
         WHERE ${where}
         ORDER BY n.created_at DESC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );

      return { notifications: rows.rows.map(mapSummary), total: Number(count.rows[0]?.count ?? 0) };
    }, this.databasePool);
  }

  async findById(
    tenantId: string,
    actorId: string,
    notificationId: string
  ): Promise<NotificationSummary | null> {
    return withTenantTransaction({ tenantId, userId: actorId }, (client) =>
      this.findByIdWithClient(client, tenantId, actorId, notificationId), this.databasePool);
  }

  async create(tenantId: string, actorId: string, input: CreateNotificationInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      try {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO notifications (tenant_id, user_id, type, title, message, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [tenantId, input.userId, input.type, input.title, input.message, input.metadata ?? {}]
        );
        return (await this.findByIdWithClient(client, tenantId, input.userId, inserted.rows[0]!.id))!;
      } catch (error) {
        throw mapDatabaseError(error);
      }
    }, this.databasePool);
  }

  async setReadState(tenantId: string, actorId: string, notificationId: string, read: boolean) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const result = await client.query(
        `UPDATE notifications SET read_at = ${read ? "CURRENT_TIMESTAMP" : "NULL"}
         WHERE tenant_id = $1 AND id = $2 AND user_id = $3`,
        [tenantId, notificationId, actorId]
      );
      if (result.rowCount === 0) throw new NotFoundError("Notification not found", "NOTIFICATION_NOT_FOUND");
      return (await this.findByIdWithClient(client, tenantId, actorId, notificationId))!;
    }, this.databasePool);
  }

  private async findByIdWithClient(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    notificationId: string
  ) {
    const result = await client.query<NotificationRow>(
      `${SELECT_NOTIFICATION}
       WHERE n.tenant_id = $1 AND n.id = $2 AND n.user_id = $3`,
      [tenantId, notificationId, actorId]
    );
    return result.rows[0] ? mapSummary(result.rows[0]) : null;
  }
}

function mapSummary(row: NotificationRow): NotificationSummary {
  const metadata = withPatientMetadata(row.metadata, row.patient_id, row.patient_full_name);
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    target: readObject(metadata?.target),
    metadata,
    readAt: row.read_at,
    createdAt: row.created_at
  };
}

function withPatientMetadata(
  metadata: Record<string, unknown> | null,
  patientId: string | null,
  patientFullName: string | null
): Record<string, unknown> | null {
  const next = { ...(metadata ?? {}) };
  if (!patientId && !patientFullName) return metadata ?? null;

  const patient = readObject(next.patient) ?? {};
  next.patient = {
    ...patient,
    ...(patientId ? { id: patientId } : {}),
    ...(patientFullName ? { fullName: patientFullName } : {})
  };
  return next;
}

function readObject(value: unknown): Record<string, string> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, string>)
    : null;
}

function mapDatabaseError(error: unknown): Error {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
  if (code === "23503") {
    return new BadRequestError("Recipient user not found", "INVALID_NOTIFICATION_RECIPIENT");
  }
  return error instanceof Error ? error : new Error("Unknown database error");
}
