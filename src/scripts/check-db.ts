import pool from "../config/db.js";

async function checkDatabase(): Promise<void> {
  try {
    const result = await pool.query<{
      connected: number;
      database_name: string;
      tenants_table: string | null;
      platform_table: string | null;
    }>(`
      SELECT
        1 AS connected,
        current_database() AS database_name,
        to_regclass('public.tenants')::text AS tenants_table,
        to_regclass('public.platform_super_admins')::text AS platform_table
    `);

    const status = result.rows[0];

    if (
      !status ||
      status.connected !== 1 ||
      status.tenants_table !== "tenants" ||
      status.platform_table !== "platform_super_admins"
    ) {
      throw new Error("Database is reachable but the crit-db baseline is missing");
    }

    console.log("PostgreSQL connection and crit-db baseline verified", {
      database: status.database_name,
      baselineTable: status.tenants_table,
      platformTable: status.platform_table
    });
  } finally {
    await pool.end();
  }
}

checkDatabase().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown database error";
  console.error("Database check failed", { message });
  process.exitCode = 1;
});
