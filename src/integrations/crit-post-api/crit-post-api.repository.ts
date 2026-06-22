import type { Pool } from "pg";

import { pool } from "../../config/db.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import type { OutboxEvent } from "./crit-post-api.types.js";

interface OutboxRow {
  id: string;
  tenant_id: string;
  payload: Record<string, unknown>;
  retry_count: number;
}

export class CritPostApiRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async listActiveTenantIds(): Promise<string[]> {
    const result = await this.databasePool.query<{ id: string }>(
      `SELECT id FROM tenants WHERE status = 'active' AND deleted_at IS NULL ORDER BY id`
    );
    return result.rows.map((row) => row.id);
  }

  async recoverStale(tenantId: string, processingTimeoutMs: number): Promise<number> {
    return withTenantTransaction({ tenantId }, async (client) => {
      const result = await client.query(
        `UPDATE crit_api_outbox
            SET status = 'failed', last_error = 'Worker interrupted before completion'
          WHERE tenant_id = $1
            AND status = 'processing'
            AND updated_at < CURRENT_TIMESTAMP - ($2 * INTERVAL '1 millisecond')`,
        [tenantId, processingTimeoutMs]
      );
      return result.rowCount ?? 0;
    }, this.databasePool);
  }

  async claim(tenantId: string, batchSize: number, maxRetries: number): Promise<OutboxEvent[]> {
    return withTenantTransaction({ tenantId }, async (client) => {
      const result = await client.query<OutboxRow>(
        `WITH available AS (
           SELECT id
             FROM crit_api_outbox
            WHERE tenant_id = $1
              AND status IN ('pending', 'failed')
              AND retry_count < $3
            ORDER BY created_at, id
            FOR UPDATE SKIP LOCKED
            LIMIT $2
         )
         UPDATE crit_api_outbox outbox
            SET status = 'processing', retry_count = outbox.retry_count + 1, last_error = NULL
           FROM available
          WHERE outbox.tenant_id = $1 AND outbox.id = available.id
         RETURNING outbox.id, outbox.tenant_id, outbox.payload, outbox.retry_count`,
        [tenantId, batchSize, maxRetries]
      );
      return result.rows.map(mapOutboxEvent);
    }, this.databasePool);
  }

  async markSent(tenantId: string, eventId: string): Promise<void> {
    await withTenantTransaction({ tenantId }, async (client) => {
      await client.query(
        `UPDATE crit_api_outbox
            SET status = 'sent', sent_at = CURRENT_TIMESTAMP, last_error = NULL
          WHERE tenant_id = $1 AND id = $2 AND status = 'processing'`,
        [tenantId, eventId]
      );
    }, this.databasePool);
  }

  async markFailed(tenantId: string, eventId: string, error: string): Promise<void> {
    await withTenantTransaction({ tenantId }, async (client) => {
      await client.query(
        `UPDATE crit_api_outbox
            SET status = 'failed', last_error = $3
          WHERE tenant_id = $1 AND id = $2 AND status = 'processing'`,
        [tenantId, eventId, error]
      );
    }, this.databasePool);
  }
}

function mapOutboxEvent(row: OutboxRow): OutboxEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    payload: row.payload,
    retryCount: row.retry_count
  };
}
