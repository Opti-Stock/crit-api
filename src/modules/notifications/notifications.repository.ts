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
  read_at: string | null;
  created_at: string;
}

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
      const filters = ["tenant_id = $1", "user_id = $2"];
      const values: unknown[] = [tenantId, actorId];

      if (input.status === "unread") filters.push("read_at IS NULL");
      if (input.status === "read") filters.push("read_at IS NOT NULL");

      const where = filters.join(" AND ");
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM notifications WHERE ${where}`,
        values
      );

      values.push(input.pageSize, (input.page - 1) * input.pageSize);
      const rows = await client.query<NotificationRow>(
        `SELECT id, type, title, message, metadata, read_at, created_at
         FROM notifications
         WHERE ${where}
         ORDER BY created_at DESC
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
      `SELECT id, type, title, message, metadata, read_at, created_at
       FROM notifications
       WHERE tenant_id = $1 AND id = $2 AND user_id = $3`,
      [tenantId, notificationId, actorId]
    );
    return result.rows[0] ? mapSummary(result.rows[0]) : null;
  }
}

function mapSummary(row: NotificationRow): NotificationSummary {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    target: readObject(row.metadata?.target),
    metadata: row.metadata ?? null,
    readAt: row.read_at,
    createdAt: row.created_at
  };
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
