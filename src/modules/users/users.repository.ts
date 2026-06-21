import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/app-error.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import type {
  ClinicAccessInput,
  CreateUserInput,
  ListUsersInput,
  UpdateUserInput
} from "./users.validation.js";

export interface UserSummary {
  id: string;
  fullName: string;
  email: string;
  status: "active" | "inactive";
  roles: { id: string; name: string }[];
}

export interface UserDetail extends UserSummary {
  clinicAccess: { clinicId: string; clinicName: string; accessLevel: "standard" | "manage" }[];
  lastLoginAt: string | null;
}

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  status: "active" | "inactive";
  last_login_at: string | null;
  roles: UserSummary["roles"];
  clinic_access: UserDetail["clinicAccess"];
}

export class UsersRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async list(tenantId: string, actorId: string, input: ListUsersInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const filters = ["u.tenant_id = $1", "u.deleted_at IS NULL"];
      const values: unknown[] = [tenantId];
      if (input.search) {
        values.push(`%${input.search}%`);
        filters.push(`(u.full_name ILIKE $${values.length} OR u.email ILIKE $${values.length})`);
      }
      if (input.status) {
        values.push(input.status);
        filters.push(`u.status = $${values.length}`);
      }
      const where = filters.join(" AND ");
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM users u WHERE ${where}`,
        values
      );
      values.push(input.pageSize, (input.page - 1) * input.pageSize);
      const rows = await client.query<UserRow>(
        `SELECT u.id, u.full_name, u.email, u.status, u.last_login_at,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) ORDER BY r.name)
            FROM user_roles ur JOIN roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
            WHERE ur.tenant_id = u.tenant_id AND ur.user_id = u.id AND r.deleted_at IS NULL), '[]') AS roles,
          '[]'::jsonb AS clinic_access
         FROM users u WHERE ${where}
         ORDER BY u.full_name, u.id LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );
      return { users: rows.rows.map(mapSummary), total: Number(count.rows[0]?.count ?? 0) };
    }, this.databasePool);
  }

  async findById(tenantId: string, actorId: string, userId: string): Promise<UserDetail | null> {
    return withTenantTransaction({ tenantId, userId: actorId }, (client) =>
      this.findByIdWithClient(client, tenantId, userId), this.databasePool);
  }

  async create(
    tenantId: string,
    actorId: string,
    input: CreateUserInput,
    passwordHash: string
  ): Promise<UserDetail> {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      await this.validateAssignments(client, tenantId, input.roleIds, input.clinicAccess);
      try {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO users (tenant_id, full_name, email, password_hash)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [tenantId, input.fullName, input.email, passwordHash]
        );
        const userId = inserted.rows[0]!.id;
        await this.insertRoles(client, tenantId, userId, input.roleIds);
        await this.insertClinicAccess(client, tenantId, userId, input.clinicAccess);
        return (await this.findByIdWithClient(client, tenantId, userId))!;
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError("Email already exists", "EMAIL_CONFLICT");
        throw error;
      }
    }, this.databasePool);
  }

  async update(tenantId: string, actorId: string, userId: string, input: UpdateUserInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const current = await this.requireUser(client, tenantId, userId);
      if (input.status === "inactive" && current.status === "active") {
        await this.assertNotLastAdmin(client, tenantId, userId);
      }
      try {
        await client.query(
          `UPDATE users SET
             full_name = COALESCE($3, full_name),
             email = COALESCE($4, email),
             status = COALESCE($5, status)
           WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [tenantId, userId, input.fullName ?? null, input.email ?? null, input.status ?? null]
        );
      } catch (error) {
        if (isUniqueViolation(error)) throw new ConflictError("Email already exists", "EMAIL_CONFLICT");
        throw error;
      }
      return (await this.findByIdWithClient(client, tenantId, userId))!;
    }, this.databasePool);
  }

  async replaceRoles(tenantId: string, actorId: string, userId: string, roleIds: string[]) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      await this.requireUser(client, tenantId, userId);
      await this.validateAssignments(client, tenantId, roleIds, []);
      const removesAdmin = !(await this.roleIdsContainAdmin(client, tenantId, roleIds));
      if (removesAdmin) await this.assertNotLastAdmin(client, tenantId, userId);
      await client.query("DELETE FROM user_roles WHERE tenant_id = $1 AND user_id = $2", [tenantId, userId]);
      await this.insertRoles(client, tenantId, userId, roleIds);
      return (await this.findByIdWithClient(client, tenantId, userId))!;
    }, this.databasePool);
  }

  async replaceClinicAccess(
    tenantId: string,
    actorId: string,
    userId: string,
    access: ClinicAccessInput[]
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      await this.requireUser(client, tenantId, userId);
      await this.validateAssignments(client, tenantId, [], access);
      await client.query("DELETE FROM user_clinic_access WHERE tenant_id = $1 AND user_id = $2", [tenantId, userId]);
      await this.insertClinicAccess(client, tenantId, userId, access);
      return (await this.findByIdWithClient(client, tenantId, userId))!;
    }, this.databasePool);
  }

  async updatePassword(tenantId: string, actorId: string, userId: string, passwordHash: string) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const result = await client.query(
        `UPDATE users SET password_hash = $3
         WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [tenantId, userId, passwordHash]
      );
      if (result.rowCount === 0) throw new NotFoundError("User not found", "USER_NOT_FOUND");
    }, this.databasePool);
  }

  private async findByIdWithClient(client: PoolClient, tenantId: string, userId: string) {
    const result = await client.query<UserRow>(
      `SELECT u.id, u.full_name, u.email, u.status, u.last_login_at,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) ORDER BY r.name)
          FROM user_roles ur JOIN roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
          WHERE ur.tenant_id = u.tenant_id AND ur.user_id = u.id AND r.deleted_at IS NULL), '[]') AS roles,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('clinicId', c.id, 'clinicName', c.name, 'accessLevel', uca.access_level) ORDER BY c.name)
          FROM user_clinic_access uca JOIN clinics c ON c.tenant_id = uca.tenant_id AND c.id = uca.clinic_id
          WHERE uca.tenant_id = u.tenant_id AND uca.user_id = u.id AND c.deleted_at IS NULL), '[]') AS clinic_access
       FROM users u WHERE u.tenant_id = $1 AND u.id = $2 AND u.deleted_at IS NULL`,
      [tenantId, userId]
    );
    return result.rows[0] ? mapDetail(result.rows[0]) : null;
  }

  private async requireUser(client: PoolClient, tenantId: string, userId: string) {
    const result = await client.query<{ status: "active" | "inactive" }>(
      "SELECT status FROM users WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL",
      [tenantId, userId]
    );
    if (!result.rows[0]) throw new NotFoundError("User not found", "USER_NOT_FOUND");
    return result.rows[0];
  }

  private async validateAssignments(client: PoolClient, tenantId: string, roleIds: string[], access: ClinicAccessInput[]) {
    if (new Set(roleIds).size !== roleIds.length || new Set(access.map((item) => item.clinicId)).size !== access.length) {
      throw new BadRequestError("Assignments must be unique", "DUPLICATE_ASSIGNMENT");
    }
    if (roleIds.length) {
      const roles = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM roles WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL",
        [tenantId, roleIds]
      );
      if (Number(roles.rows[0]?.count) !== roleIds.length) throw new BadRequestError("Invalid role assignment", "INVALID_ROLE_ASSIGNMENT");
    }
    if (access.length) {
      const ids = access.map((item) => item.clinicId);
      const clinics = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM clinics WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL",
        [tenantId, ids]
      );
      if (Number(clinics.rows[0]?.count) !== ids.length) throw new BadRequestError("Invalid clinic assignment", "INVALID_CLINIC_ASSIGNMENT");
    }
  }

  private async assertNotLastAdmin(client: PoolClient, tenantId: string, userId: string) {
    const target = await client.query<{ is_admin: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
       WHERE ur.tenant_id = $1 AND ur.user_id = $2 AND r.name = 'admin' AND r.deleted_at IS NULL) AS is_admin`,
      [tenantId, userId]
    );
    if (!target.rows[0]?.is_admin) return;
    const admins = await client.query<{ count: string }>(
      `SELECT count(DISTINCT u.id)::text AS count FROM users u
       JOIN user_roles ur ON ur.tenant_id = u.tenant_id AND ur.user_id = u.id
       JOIN roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
       WHERE u.tenant_id = $1 AND u.status = 'active' AND u.deleted_at IS NULL
         AND r.name = 'admin' AND r.deleted_at IS NULL`, [tenantId]
    );
    if (Number(admins.rows[0]?.count) <= 1) throw new ConflictError("The last active admin cannot be changed", "LAST_ACTIVE_ADMIN");
  }

  private async roleIdsContainAdmin(client: PoolClient, tenantId: string, roleIds: string[]) {
    const result = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM roles WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND name = 'admin' AND deleted_at IS NULL) AS exists",
      [tenantId, roleIds]
    );
    return result.rows[0]?.exists ?? false;
  }

  private async insertRoles(client: PoolClient, tenantId: string, userId: string, roleIds: string[]) {
    if (!roleIds.length) return;
    await client.query(
      "INSERT INTO user_roles (tenant_id, user_id, role_id) SELECT $1, $2, unnest($3::uuid[])",
      [tenantId, userId, roleIds]
    );
  }

  private async insertClinicAccess(client: PoolClient, tenantId: string, userId: string, access: ClinicAccessInput[]) {
    for (const item of access) {
      await client.query(
        "INSERT INTO user_clinic_access (tenant_id, user_id, clinic_id, access_level) VALUES ($1, $2, $3, $4)",
        [tenantId, userId, item.clinicId, item.accessLevel]
      );
    }
  }
}

function mapSummary(row: UserRow): UserSummary {
  return { id: row.id, fullName: row.full_name, email: row.email, status: row.status, roles: row.roles };
}
function mapDetail(row: UserRow): UserDetail {
  return { ...mapSummary(row), clinicAccess: row.clinic_access, lastLoginAt: row.last_login_at };
}
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
