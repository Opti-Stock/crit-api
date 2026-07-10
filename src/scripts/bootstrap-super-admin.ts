import { hash } from "bcrypt";

import { env } from "../config/env.js";
import { platformPool } from "../config/platform-db.js";

async function bootstrapSuperAdmin() {
  const email = env.PLATFORM_BOOTSTRAP_EMAIL;
  const password = env.PLATFORM_BOOTSTRAP_PASSWORD;

  if (!email || !password) {
    throw new Error("PLATFORM_BOOTSTRAP_EMAIL and PLATFORM_BOOTSTRAP_PASSWORD are required");
  }

  const passwordHash = await hash(password, env.BCRYPT_SALT_ROUNDS);
  const client = await platformPool.connect();

  try {
    await client.query("BEGIN");
    const active = await client.query<{ id: string; email: string }>(
      `SELECT id, email
       FROM platform_super_admins
       WHERE status = 'active' AND deleted_at IS NULL
       LIMIT 1`
    );
    const existing = active.rows[0];

    if (existing) {
      if (existing.email !== email) {
        throw new Error("Another active platform super admin already exists");
      }

      await client.query(
        `UPDATE platform_super_admins
         SET full_name = $2, password_hash = $3
         WHERE id = $1`,
        [existing.id, env.PLATFORM_BOOTSTRAP_FULL_NAME, passwordHash]
      );
      await client.query("COMMIT");
      console.log("Platform super admin already existed; credentials were refreshed", { email });
      return;
    }

    await client.query(
      `INSERT INTO platform_super_admins (full_name, email, password_hash)
       VALUES ($1, $2, $3)`,
      [env.PLATFORM_BOOTSTRAP_FULL_NAME, email, passwordHash]
    );
    await client.query("COMMIT");
    console.log("Platform super admin created", { email });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

bootstrapSuperAdmin()
  .catch((error: unknown) => {
    console.error("Platform super admin bootstrap failed", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    process.exitCode = 1;
  })
  .finally(() => platformPool.end());
