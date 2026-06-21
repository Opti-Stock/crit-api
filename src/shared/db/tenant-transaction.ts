import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";

export interface TenantTransactionContext {
  tenantId: string;
  userId?: string;
}

export async function withTenantTransaction<TResult>(
  context: TenantTransactionContext,
  operation: (client: PoolClient) => Promise<TResult>,
  databasePool: Pool = pool
): Promise<TResult> {
  const client = await databasePool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.current_tenant_id', $1, true)",
      [context.tenantId]
    );
    await client.query(
      "SELECT set_config('app.current_user_id', $1, true)",
      [context.userId ?? ""]
    );

    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
