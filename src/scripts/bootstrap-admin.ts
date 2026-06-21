import "dotenv/config";

import { hash } from "bcrypt";
import { z } from "zod";

import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { withTenantTransaction } from "../shared/db/tenant-transaction.js";

const bootstrapSchema = z.object({
  BOOTSTRAP_ADMIN_TENANT_CODE: z.string().trim().min(1).transform((value) => value.toUpperCase()),
  BOOTSTRAP_ADMIN_FULL_NAME: z.string().trim().min(1).max(255),
  BOOTSTRAP_ADMIN_EMAIL: z.string().transform((value) => value.trim().toLowerCase()).pipe(z.email()),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(72)
});

async function bootstrapAdmin() {
  const input = bootstrapSchema.parse(process.env);
  const tenant = await pool.query<{ id: string }>(
    `SELECT id FROM tenants
     WHERE upper(code) = $1 AND status = 'active' AND deleted_at IS NULL LIMIT 1`,
    [input.BOOTSTRAP_ADMIN_TENANT_CODE]
  );
  const tenantId = tenant.rows[0]?.id;
  if (!tenantId) throw new Error("Bootstrap tenant was not found or is inactive");

  const passwordHash = await hash(input.BOOTSTRAP_ADMIN_PASSWORD, env.BCRYPT_SALT_ROUNDS);
  const result = await withTenantTransaction({ tenantId }, async (client) => {
    const existing = await client.query<{ id: string; is_admin: boolean }>(
      `SELECT u.id, EXISTS (
         SELECT 1 FROM user_roles ur JOIN roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
         WHERE ur.tenant_id = u.tenant_id AND ur.user_id = u.id AND r.name = 'admin' AND r.deleted_at IS NULL
       ) AS is_admin
       FROM users u WHERE u.tenant_id = $1 AND lower(u.email) = $2 AND u.deleted_at IS NULL LIMIT 1`,
      [tenantId, input.BOOTSTRAP_ADMIN_EMAIL]
    );
    if (existing.rows[0]?.is_admin) return "already-exists" as const;
    if (existing.rows[0]) throw new Error("Bootstrap email exists without the admin role");

    const admins = await client.query(
      `SELECT 1 FROM users u
       JOIN user_roles ur ON ur.tenant_id = u.tenant_id AND ur.user_id = u.id
       JOIN roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
       WHERE u.tenant_id = $1 AND u.status = 'active' AND u.deleted_at IS NULL
         AND r.name = 'admin' AND r.deleted_at IS NULL LIMIT 1`,
      [tenantId]
    );
    if (admins.rowCount) throw new Error("Another active admin already exists for this tenant");

    const role = await client.query<{ id: string }>(
      "SELECT id FROM roles WHERE tenant_id = $1 AND name = 'admin' AND deleted_at IS NULL LIMIT 1",
      [tenantId]
    );
    if (!role.rows[0]) throw new Error("The seeded admin role was not found");

    const user = await client.query<{ id: string }>(
      `INSERT INTO users (tenant_id, full_name, email, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [tenantId, input.BOOTSTRAP_ADMIN_FULL_NAME, input.BOOTSTRAP_ADMIN_EMAIL, passwordHash]
    );
    await client.query(
      "INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)",
      [tenantId, user.rows[0]!.id, role.rows[0].id]
    );
    return "created" as const;
  }, pool);

  console.log(result === "created" ? "Local admin created" : "Local admin already exists");
}

bootstrapAdmin()
  .catch((error: unknown) => {
    console.error("Admin bootstrap failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error"
    });
    process.exitCode = 1;
  })
  .finally(() => pool.end());
