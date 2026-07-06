import type { Pool, PoolClient } from "pg";

import { platformPool } from "../../config/platform-db.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/app-error.js";
import { CANONICAL_TENANT_ROLES } from "./platform.constants.js";
import type { CreateTenantAdminInput, CreateTenantInput, UpdateTenantInput } from "./platform.validation.js";

export interface PlatformCredentialRecord {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
}

export interface TenantSummary {
  id: string;
  code: string;
  name: string;
  state: string | null;
  city: string | null;
  status: "active" | "inactive";
  createdAt: string;
  counts: {
    users: number;
    clinics: number;
    collaborators: number;
    patients: number;
    appointments: number;
    attendanceRecords: number;
  };
}

export interface TenantAdminSummary {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  status: "active" | "inactive";
}

interface TenantRow {
  id: string;
  code: string;
  name: string;
  state: string | null;
  city: string | null;
  status: "active" | "inactive";
  created_at: string;
}

interface PlatformCredentialRow {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
}

interface TenantAdminRow {
  id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  status: "active" | "inactive";
}

export class PlatformRepository {
  constructor(private readonly databasePool: Pool = platformPool) {}

  async findActiveCredentialsByEmail(email: string): Promise<PlatformCredentialRecord | null> {
    const result = await this.databasePool.query<PlatformCredentialRow>(
      `SELECT id, full_name, email, password_hash
       FROM platform_super_admins
       WHERE lower(email) = $1
         AND status = 'active'
         AND deleted_at IS NULL
       LIMIT 1`,
      [email]
    );

    return result.rows[0] ? mapCredentials(result.rows[0]) : null;
  }

  async recordSuccessfulLogin(superAdminId: string): Promise<void> {
    await this.databasePool.query(
      `UPDATE platform_super_admins
       SET last_login_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'active' AND deleted_at IS NULL`,
      [superAdminId]
    );
  }

  async listTenants(): Promise<TenantSummary[]> {
    const result = await this.databasePool.query<TenantRow>(
      `SELECT id, code, name, state, city, status, created_at
       FROM tenants
       WHERE deleted_at IS NULL
       ORDER BY name, code`
    );

    const tenants: TenantSummary[] = [];
    for (const row of result.rows) {
      tenants.push({ ...mapTenant(row), counts: await this.getTenantCounts(row.id) });
    }
    return tenants;
  }

  async getTenant(tenantId: string): Promise<TenantSummary | null> {
    const result = await this.databasePool.query<TenantRow>(
      `SELECT id, code, name, state, city, status, created_at
       FROM tenants
       WHERE id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );
    const row = result.rows[0];
    return row ? { ...mapTenant(row), counts: await this.getTenantCounts(row.id) } : null;
  }

  async createTenant(superAdminId: string, input: CreateTenantInput): Promise<TenantSummary> {
    const client = await this.databasePool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<TenantRow>(
        `INSERT INTO tenants (code, name, state, city)
         VALUES ($1, $2, $3, $4)
         RETURNING id, code, name, state, city, status, created_at`,
        [input.code, input.name, input.state ?? null, input.city ?? null]
      );
      const tenant = inserted.rows[0]!;
      await this.seedRoles(client, tenant.id);
      await this.insertPlatformAudit(client, superAdminId, "tenant.created", "tenant", tenant.id, {
        code: tenant.code
      });
      await client.query("COMMIT");
      return { ...mapTenant(tenant), counts: emptyCounts() };
    } catch (error) {
      await client.query("ROLLBACK");
      throw mapDatabaseError(error, "TENANT_CONFLICT");
    } finally {
      client.release();
    }
  }

  async updateTenant(superAdminId: string, tenantId: string, input: UpdateTenantInput): Promise<TenantSummary> {
    const result = await this.databasePool.query<TenantRow>(
      `UPDATE tenants
       SET name = COALESCE($2, name),
           state = CASE WHEN $3::text IS NULL THEN state ELSE $3 END,
           city = CASE WHEN $4::text IS NULL THEN city ELSE $4 END,
           status = COALESCE($5, status)
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, code, name, state, city, status, created_at`,
      [tenantId, input.name ?? null, input.state ?? null, input.city ?? null, input.status ?? null]
    );
    const tenant = result.rows[0];
    if (!tenant) throw new NotFoundError("Tenant not found", "TENANT_NOT_FOUND");
    await this.insertPlatformAudit(this.databasePool, superAdminId, "tenant.updated", "tenant", tenantId, {
      changedFields: Object.keys(input)
    });
    return { ...mapTenant(tenant), counts: await this.getTenantCounts(tenantId) };
  }

  async createFirstTenantAdmin(
    superAdminId: string,
    tenantId: string,
    input: CreateTenantAdminInput,
    passwordHash: string
  ): Promise<TenantAdminSummary> {
    const client = await this.databasePool.connect();
    try {
      await client.query("BEGIN");
      await this.setTenantContext(client, tenantId);
      await this.requireTenant(client, tenantId);
      await this.seedRoles(client, tenantId);

      const existingAdmins = await client.query<{ count: string }>(
        `SELECT count(DISTINCT u.id)::text AS count
         FROM users u
         JOIN user_roles ur ON ur.tenant_id = u.tenant_id AND ur.user_id = u.id
         JOIN roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
         WHERE u.tenant_id = $1
           AND u.status = 'active'
           AND u.deleted_at IS NULL
           AND r.name = 'admin'
           AND r.deleted_at IS NULL`,
        [tenantId]
      );
      if (Number(existingAdmins.rows[0]?.count ?? 0) > 0) {
        throw new ConflictError("Tenant already has an active admin", "TENANT_ADMIN_EXISTS");
      }

      const role = await client.query<{ id: string }>(
        `SELECT id FROM roles WHERE tenant_id = $1 AND name = 'admin' AND deleted_at IS NULL`,
        [tenantId]
      );
      const adminRoleId = role.rows[0]?.id;
      if (!adminRoleId) throw new BadRequestError("Admin role is missing", "ADMIN_ROLE_MISSING");

      const inserted = await client.query<TenantAdminRow>(
        `INSERT INTO users (tenant_id, full_name, email, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, tenant_id, full_name, email, status`,
        [tenantId, input.fullName, input.email, passwordHash]
      );
      const admin = inserted.rows[0]!;
      await client.query(
        `INSERT INTO user_roles (tenant_id, user_id, role_id)
         VALUES ($1, $2, $3)`,
        [tenantId, admin.id, adminRoleId]
      );
      await this.insertPlatformAudit(client, superAdminId, "tenant_admin.created", "user", admin.id, {
        tenantId
      });
      await client.query("COMMIT");
      return mapTenantAdmin(admin);
    } catch (error) {
      await client.query("ROLLBACK");
      throw mapDatabaseError(error, "TENANT_ADMIN_CONFLICT");
    } finally {
      client.release();
    }
  }

  private async getTenantCounts(tenantId: string): Promise<TenantSummary["counts"]> {
    const client = await this.databasePool.connect();
    try {
      await client.query("BEGIN");
      await this.setTenantContext(client, tenantId);
      const result = await client.query<{
        users: string;
        clinics: string;
        collaborators: string;
        patients: string;
        appointments: string;
        attendance_records: string;
      }>(
        `SELECT
           (SELECT count(*)::text FROM users WHERE tenant_id = $1 AND deleted_at IS NULL) AS users,
           (SELECT count(*)::text FROM clinics WHERE tenant_id = $1 AND deleted_at IS NULL) AS clinics,
           (SELECT count(*)::text FROM collaborators WHERE tenant_id = $1 AND deleted_at IS NULL) AS collaborators,
           (SELECT count(*)::text FROM patients WHERE tenant_id = $1 AND deleted_at IS NULL) AS patients,
           (SELECT count(*)::text FROM appointments WHERE tenant_id = $1 AND deleted_at IS NULL) AS appointments,
           (SELECT count(*)::text FROM attendance_records WHERE tenant_id = $1 AND deleted_at IS NULL) AS attendance_records`,
        [tenantId]
      );
      await client.query("COMMIT");
      const row = result.rows[0];
      return {
        users: Number(row?.users ?? 0),
        clinics: Number(row?.clinics ?? 0),
        collaborators: Number(row?.collaborators ?? 0),
        patients: Number(row?.patients ?? 0),
        appointments: Number(row?.appointments ?? 0),
        attendanceRecords: Number(row?.attendance_records ?? 0)
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async requireTenant(client: PoolClient, tenantId: string): Promise<void> {
    const result = await client.query(
      `SELECT 1 FROM tenants WHERE id = $1 AND status = 'active' AND deleted_at IS NULL`,
      [tenantId]
    );
    if (result.rowCount === 0) throw new NotFoundError("Tenant not found", "TENANT_NOT_FOUND");
  }

  private async seedRoles(client: PoolClient, tenantId: string): Promise<void> {
    await this.setTenantContext(client, tenantId);
    for (const role of CANONICAL_TENANT_ROLES) {
      await client.query(
        `INSERT INTO roles (tenant_id, name, description)
         SELECT $1::uuid, $2::varchar(100), $3::text
         WHERE NOT EXISTS (
           SELECT 1 FROM roles
           WHERE tenant_id = $1 AND name = $2::varchar(100) AND deleted_at IS NULL
         )`,
        [tenantId, role.name, role.description]
      );
      await client.query(
        `UPDATE roles
         SET description = $3::text, deleted_at = NULL
         WHERE tenant_id = $1 AND name = $2::varchar(100)`,
        [tenantId, role.name, role.description]
      );
    }
  }

  private async setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [""]);
  }

  private async insertPlatformAudit(
    clientOrPool: PoolClient | Pool,
    superAdminId: string,
    action: string,
    entityType: string,
    entityId: string | null,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await clientOrPool.query(
      `INSERT INTO platform_audit_logs (super_admin_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [superAdminId, action, entityType, entityId, JSON.stringify(metadata)]
    );
  }
}

function mapCredentials(row: PlatformCredentialRow): PlatformCredentialRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    passwordHash: row.password_hash
  };
}

function mapTenant(row: TenantRow): Omit<TenantSummary, "counts"> {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    state: row.state,
    city: row.city,
    status: row.status,
    createdAt: row.created_at
  };
}

function mapTenantAdmin(row: TenantAdminRow): TenantAdminSummary {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    fullName: row.full_name,
    email: row.email,
    status: row.status
  };
}

function emptyCounts(): TenantSummary["counts"] {
  return {
    users: 0,
    clinics: 0,
    collaborators: 0,
    patients: 0,
    appointments: 0,
    attendanceRecords: 0
  };
}

function mapDatabaseError(error: unknown, conflictCode: string): Error {
  if (error instanceof ConflictError || error instanceof NotFoundError || error instanceof BadRequestError) {
    return error;
  }

  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;

  if (code === "23505") {
    return new ConflictError("Platform operation conflicts with existing data", conflictCode);
  }
  if (code === "23503" || code === "23514") {
    return new BadRequestError("Platform operation violates a data constraint", "INVALID_PLATFORM_DATA");
  }
  return error instanceof Error ? error : new Error("Unknown database error");
}
