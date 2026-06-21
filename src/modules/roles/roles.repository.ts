import type { Pool } from "pg";

import { pool } from "../../config/db.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";

export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
}

export class RolesRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async list(tenantId: string, userId: string): Promise<RoleSummary[]> {
    return withTenantTransaction(
      { tenantId, userId },
      async (client) => {
        const result = await client.query<RoleSummary>(
          `SELECT id, name, description
           FROM roles
           WHERE tenant_id = $1
             AND deleted_at IS NULL
           ORDER BY name`,
          [tenantId]
        );
        return result.rows;
      },
      this.databasePool
    );
  }
}
