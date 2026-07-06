import type { Pool } from "pg";

import { pool } from "../../config/db.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";

export interface AuthCredentialRecord {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  passwordHash: string;
  roles: string[];
}

export interface AuthRepositoryContract {
  findActiveCredentialsByEmail(email: string): Promise<AuthCredentialRecord[]>;
  recordSuccessfulLogin(tenantId: string, userId: string): Promise<void>;
}

interface CredentialRow {
  id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  password_hash: string;
  roles: string[];
}

interface TenantRow {
  id: string;
}

export class AuthRepository implements AuthRepositoryContract {
  constructor(private readonly databasePool: Pool = pool) {}

  async findActiveCredentialsByEmail(email: string): Promise<AuthCredentialRecord[]> {
    const tenants = await this.listActiveTenants();
    const matches: AuthCredentialRecord[] = [];

    for (const tenantId of tenants) {
      const credentials = await this.findActiveCredentialsInTenant(tenantId, email);
      if (credentials) {
        matches.push(credentials);
      }

      if (matches.length > 1) {
        break;
      }
    }

    return matches;
  }

  async recordSuccessfulLogin(tenantId: string, userId: string): Promise<void> {
    await withTenantTransaction(
      { tenantId, userId },
      async (client) => {
        await client.query(
          `UPDATE users
           SET last_login_at = CURRENT_TIMESTAMP
           WHERE tenant_id = $1
             AND id = $2
             AND status = 'active'
             AND deleted_at IS NULL`,
          [tenantId, userId]
        );
      },
      this.databasePool
    );
  }

  private async listActiveTenants(): Promise<string[]> {
    const result = await this.databasePool.query<TenantRow>(
      `SELECT id
       FROM tenants
       WHERE status = 'active'
         AND deleted_at IS NULL
       ORDER BY id`
    );

    return result.rows.map((row) => row.id);
  }

  private async findActiveCredentialsInTenant(
    tenantId: string,
    email: string
  ): Promise<AuthCredentialRecord | null> {
    return withTenantTransaction(
      { tenantId },
      async (client) => {
        const result = await client.query<CredentialRow>(
          `SELECT
             u.id,
             u.tenant_id,
             u.full_name,
             u.email,
             u.password_hash,
             COALESCE(
               array_agg(r.name ORDER BY r.name) FILTER (WHERE r.id IS NOT NULL),
               ARRAY[]::varchar[]
             ) AS roles
           FROM users u
           LEFT JOIN user_roles ur
             ON ur.tenant_id = u.tenant_id
            AND ur.user_id = u.id
           LEFT JOIN roles r
             ON r.tenant_id = ur.tenant_id
            AND r.id = ur.role_id
            AND r.deleted_at IS NULL
           WHERE u.tenant_id = $1
             AND lower(u.email) = $2
             AND u.status = 'active'
             AND u.deleted_at IS NULL
           GROUP BY u.id
           LIMIT 1`,
          [tenantId, email]
        );

        const row = result.rows[0];
        if (!row) {
          return null;
        }

        return {
          id: row.id,
          tenantId: row.tenant_id,
          fullName: row.full_name,
          email: row.email,
          passwordHash: row.password_hash,
          roles: row.roles
        };
      },
      this.databasePool
    );
  }
}
