import "dotenv/config";

import { pool } from "../config/db.js";
import { withTenantTransaction } from "../shared/db/tenant-transaction.js";

interface TenantRow {
  id: string;
  code: string;
}

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  status: "active" | "inactive";
  roles: string[];
}

async function backfillCollaborators() {
  const tenants = await pool.query<TenantRow>(
    `SELECT id, code
     FROM tenants
     WHERE status = 'active' AND deleted_at IS NULL
     ORDER BY code`
  );

  let createdOrUpdated = 0;

  for (const tenant of tenants.rows) {
    const count = await withTenantTransaction({ tenantId: tenant.id }, async (client) => {
      const users = await client.query<UserRow>(
        `SELECT u.id, u.full_name, u.email, u.status,
                COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
         FROM users u
         JOIN user_roles ur ON ur.tenant_id = u.tenant_id AND ur.user_id = u.id
         JOIN roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
         WHERE u.tenant_id = $1
           AND u.deleted_at IS NULL
           AND r.deleted_at IS NULL
         GROUP BY u.id, u.full_name, u.email, u.status
         ORDER BY u.full_name`,
        [tenant.id]
      );

      let tenantCount = 0;

      for (const user of users.rows) {
        const shouldHaveCollaborator = user.roles.some((role) => role !== "paciente_familia");
        if (!shouldHaveCollaborator) continue;

        const clinicalRole = user.roles.find((role) => role === "medico" || role === "terapeuta");
        const specialty = clinicalRole ?? user.roles[0] ?? "staff";
        const position = user.roles.join(", ");
        const collaborator = await client.query<{ id: string }>(
          `INSERT INTO collaborators (
             tenant_id, user_id, full_name, email, specialty, position, status, deleted_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
           ON CONFLICT (user_id) DO UPDATE
           SET full_name = EXCLUDED.full_name,
               email = EXCLUDED.email,
               specialty = COALESCE(collaborators.specialty, EXCLUDED.specialty),
               position = EXCLUDED.position,
               status = EXCLUDED.status,
               deleted_at = NULL
           RETURNING id`,
          [tenant.id, user.id, user.full_name, user.email, specialty, position, user.status]
        );

        const clinics = await client.query<{ clinic_id: string }>(
          `SELECT clinic_id
           FROM user_clinic_access
           WHERE tenant_id = $1 AND user_id = $2`,
          [tenant.id, user.id]
        );
        await client.query(
          "DELETE FROM collaborator_clinics WHERE tenant_id = $1 AND collaborator_id = $2",
          [tenant.id, collaborator.rows[0]!.id]
        );
        for (const clinic of clinics.rows) {
          await client.query(
            `INSERT INTO collaborator_clinics (tenant_id, collaborator_id, clinic_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (tenant_id, collaborator_id, clinic_id) DO NOTHING`,
            [tenant.id, collaborator.rows[0]!.id, clinic.clinic_id]
          );
        }

        tenantCount += 1;
      }

      return tenantCount;
    }, pool);

    createdOrUpdated += count;
    console.log(`Tenant ${tenant.code}: synced ${count} collaborators`);
  }

  console.log(`Collaborator backfill complete: ${createdOrUpdated} users synced`);
}

backfillCollaborators()
  .catch((error: unknown) => {
    console.error("Collaborator backfill failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error"
    });
    process.exitCode = 1;
  })
  .finally(() => pool.end());
