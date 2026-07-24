import { pool } from "../config/db.js";
import { withTenantTransaction } from "../shared/db/tenant-transaction.js";

const tenantId = argument("--tenant");
const userId = argument("--user");

const result = await withTenantTransaction({ tenantId, userId }, async (client) => {
  const notes = await client.query<{ id: string }>(
    `SELECT id FROM medical_notes WHERE tenant_id = $1 AND deleted_at IS NULL
     UNION ALL
     SELECT id FROM handoff_notes WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );
  let queued = 0;
  for (const note of notes.rows) {
    const inserted = await client.query(
      `INSERT INTO ai_jobs (
         tenant_id, job_type, resource_id, requested_by_user_id, priority
       ) VALUES ($1, 'index_note', $2, $3, 10)
       ON CONFLICT DO NOTHING`,
      [tenantId, note.id, userId]
    );
    queued += inserted.rowCount ?? 0;
  }
  return { visibleNotes: notes.rowCount ?? 0, queued };
});

process.stdout.write(`${JSON.stringify({ event: "ai_reindex_queued", ...result })}\n`);
await pool.end();

function argument(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
