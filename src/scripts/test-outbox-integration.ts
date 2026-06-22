import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";

import { pool } from "../config/db.js";
import { CritPostApiClient } from "../integrations/crit-post-api/crit-post-api.client.js";
import { insertAttendanceRegisteredEvent } from "../integrations/crit-post-api/crit-post-api.payload.js";
import { CritPostApiRepository } from "../integrations/crit-post-api/crit-post-api.repository.js";
import { CritPostApiService } from "../integrations/crit-post-api/crit-post-api.service.js";
import { AttendanceRepository } from "../modules/attendance/attendance.repository.js";
import { withTenantTransaction } from "../shared/db/tenant-transaction.js";

interface Fixture {
  tenantId: string;
  actorId: string;
  userId: string;
  patientId: string;
  collaboratorId: string;
  clinicId: string;
  roomId: string;
  appointmentTypeId: string;
  appointmentId: string;
  rollbackAppointmentId: string;
}

async function run() {
  const fixture = await createFixture();
  const received: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
  let responseStatus = 204;
  const mock = await listenMockApi((headers, body) => {
    received.push({ headers, body });
    return responseStatus;
  });

  try {
    const attendance = await new AttendanceRepository(pool).create(
      fixture.tenantId,
      fixture.actorId,
      ["admin"],
      { appointmentId: fixture.appointmentId, status: "present", notesRequired: false }
    );
    const pending = await getOutboxByEntity(fixture, attendance.id);
    assert.equal(pending.status, "pending");
    assert.equal(pending.retry_count, 0);
    assert.equal(pending.payload.eventType, "attendance.registered");
    assert.equal(JSON.stringify(pending.payload).includes("fullName"), false);
    assert.equal(JSON.stringify(pending.payload).includes("notesRequired"), false);

    await assertAtomicRollback(fixture);

    const repository = new CritPostApiRepository(pool);
    const service = createService(repository, mock.url);
    const sentSummary = await service.processOnce();
    assert.equal(sentSummary.sent >= 1, true);
    const sent = await getOutboxByEntity(fixture, attendance.id);
    assert.equal(sent.status, "sent");
    assert.equal(sent.retry_count, 1);
    assert.ok(sent.sent_at);
    assert.equal(received[0]?.headers["idempotency-key"], sent.id);
    assert.equal(received[0]?.headers.authorization, "Bearer integration-token");

    responseStatus = 503;
    const failedId = await insertRawEvent(fixture, "failed-test", "pending", 0);
    await service.processOnce();
    const failed = await getOutboxById(fixture, failedId);
    assert.equal(failed.status, "failed");
    assert.equal(failed.retry_count, 1);
    assert.equal(failed.last_error, "External API returned HTTP 503");

    const exhaustedId = await insertRawEvent(fixture, "exhausted-test", "failed", 5);
    const exhaustedSummary = await service.processOnce();
    assert.equal(exhaustedSummary.claimed, 1);
    const exhausted = await getOutboxById(fixture, exhaustedId);
    assert.equal(exhausted.retry_count, 5);

    responseStatus = 204;
    const staleId = await insertRawEvent(fixture, "stale-test", "processing", 1, true);
    const staleSummary = await service.processOnce();
    assert.equal(staleSummary.recovered >= 1, true);
    assert.equal((await getOutboxById(fixture, staleId)).status, "sent");

    const concurrentId = await insertRawEvent(fixture, "concurrent-test", "pending", 0);
    const [first, second] = await Promise.all([
      createService(new CritPostApiRepository(pool), mock.url).processOnce(),
      createService(new CritPostApiRepository(pool), mock.url).processOnce()
    ]);
    assert.equal(first.claimed + second.claimed, 1);
    assert.equal((await getOutboxById(fixture, concurrentId)).status, "sent");

    console.log("Outbox integration checks passed");
  } finally {
    await close(mock.server);
    await cleanupFixture(fixture);
    await pool.end();
  }
}

function createService(repository: CritPostApiRepository, url: string) {
  return new CritPostApiService(
    repository,
    new CritPostApiClient({ url, token: "integration-token", requestTimeoutMs: 2_000 }),
    { batchSize: 10, maxRetries: 5, processingTimeoutMs: 1_000 }
  );
}

async function createFixture(): Promise<Fixture> {
  const tenantCode = process.env.BOOTSTRAP_ADMIN_TENANT_CODE;
  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!tenantCode || !adminEmail) throw new Error("Bootstrap tenant code and admin email are required");

  const tenant = await pool.query<{ id: string }>(
    "SELECT id FROM tenants WHERE code = $1 AND status = 'active' AND deleted_at IS NULL",
    [tenantCode.trim().toUpperCase()]
  );
  const tenantId = tenant.rows[0]?.id;
  if (!tenantId) throw new Error("Bootstrap tenant was not found");

  const ids = {
    tenantId,
    actorId: "",
    userId: randomUUID(),
    patientId: randomUUID(),
    collaboratorId: randomUUID(),
    clinicId: randomUUID(),
    roomId: randomUUID(),
    appointmentTypeId: randomUUID(),
    appointmentId: randomUUID(),
    rollbackAppointmentId: randomUUID()
  };

  ids.actorId = await withTenantTransaction({ tenantId }, async (client) => {
    const actor = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE tenant_id = $1 AND lower(email) = lower($2) AND deleted_at IS NULL",
      [tenantId, adminEmail]
    );
    if (!actor.rows[0]) throw new Error("Bootstrap admin was not found");
    return actor.rows[0].id;
  }, pool);

  await withTenantTransaction({ tenantId, userId: ids.actorId }, async (client) => {
    await client.query(
      `INSERT INTO users (id, tenant_id, full_name, email, password_hash)
       VALUES ($1, $2, 'Outbox Test Collaborator', $3, 'integration-only')`,
      [ids.userId, tenantId, `outbox-${ids.userId}@crit.test`]
    );
    await client.query(
      `INSERT INTO patients (id, tenant_id, external_id, full_name, birth_date)
       VALUES ($1, $2, $3, 'Outbox Test Patient', DATE '2000-01-01')`,
      [ids.patientId, tenantId, `PAT-${ids.patientId}`]
    );
    await client.query(
      `INSERT INTO collaborators (id, tenant_id, user_id, external_id, full_name, specialty)
       VALUES ($1, $2, $3, $4, 'Outbox Test Collaborator', 'Integration')`,
      [ids.collaboratorId, tenantId, ids.userId, `COL-${ids.collaboratorId}`]
    );
    await client.query(
      "INSERT INTO clinics (id, tenant_id, name) VALUES ($1, $2, $3)",
      [ids.clinicId, tenantId, `Outbox Clinic ${ids.clinicId}`]
    );
    await client.query(
      "INSERT INTO rooms (id, tenant_id, clinic_id, name) VALUES ($1, $2, $3, 'Room')",
      [ids.roomId, tenantId, ids.clinicId]
    );
    await client.query(
      `INSERT INTO collaborator_clinics (tenant_id, collaborator_id, clinic_id)
       VALUES ($1, $2, $3)`,
      [tenantId, ids.collaboratorId, ids.clinicId]
    );
    await client.query(
      `INSERT INTO appointment_types
         (id, tenant_id, name, default_duration_minutes)
       VALUES ($1, $2, $3, 30)`,
      [ids.appointmentTypeId, tenantId, `Outbox Type ${ids.appointmentTypeId}`]
    );
    for (const appointmentId of [ids.appointmentId, ids.rollbackAppointmentId]) {
      await client.query(
        `INSERT INTO appointments
           (id, tenant_id, patient_id, collaborator_id, clinic_id, room_id,
            appointment_type_id, starts_at, ends_at, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
                 CURRENT_TIMESTAMP + INTERVAL '1 day',
                 CURRENT_TIMESTAMP + INTERVAL '1 day 30 minutes', $8)`,
        [appointmentId, tenantId, ids.patientId, ids.collaboratorId, ids.clinicId,
          ids.roomId, ids.appointmentTypeId, ids.actorId]
      );
    }
  }, pool);

  return ids;
}

async function assertAtomicRollback(fixture: Fixture) {
  await assert.rejects(() => withTenantTransaction(
    { tenantId: fixture.tenantId, userId: fixture.actorId },
    async (client) => {
      const attendanceId = randomUUID();
      await client.query(
        `INSERT INTO attendance_records
           (id, tenant_id, appointment_id, patient_id, collaborator_id,
            checked_by_user_id, status, checked_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'present', CURRENT_TIMESTAMP)`,
        [attendanceId, fixture.tenantId, fixture.rollbackAppointmentId, fixture.patientId,
          fixture.collaboratorId, fixture.actorId]
      );
      await insertAttendanceRegisteredEvent(client, {
        tenantId: fixture.tenantId,
        attendanceId,
        appointmentId: fixture.rollbackAppointmentId,
        patientId: randomUUID(),
        collaboratorId: fixture.collaboratorId,
        status: "present",
        checkedAt: new Date().toISOString()
      });
    },
    pool
  ));

  const count = await withTenantTransaction(
    { tenantId: fixture.tenantId, userId: fixture.actorId },
    async (client) => client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM attendance_records WHERE tenant_id = $1 AND appointment_id = $2",
      [fixture.tenantId, fixture.rollbackAppointmentId]
    ),
    pool
  );
  assert.equal(count.rows[0]?.count, "0");
}

async function insertRawEvent(
  fixture: Fixture,
  entityType: string,
  status: "pending" | "processing" | "failed",
  retryCount: number,
  stale = false
): Promise<string> {
  const id = randomUUID();
  await withTenantTransaction({ tenantId: fixture.tenantId }, async (client) => {
    await client.query(
      `INSERT INTO crit_api_outbox
         (id, tenant_id, entity_type, entity_id, payload, status, retry_count, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7,
               CASE WHEN $8 THEN CURRENT_TIMESTAMP - INTERVAL '2 minutes' ELSE CURRENT_TIMESTAMP END)`,
      [id, fixture.tenantId, entityType, randomUUID(), JSON.stringify({ eventId: id }),
        status, retryCount, stale]
    );
  }, pool);
  return id;
}

async function getOutboxByEntity(fixture: Fixture, entityId: string) {
  return withTenantTransaction({ tenantId: fixture.tenantId }, async (client) => {
    const result = await client.query(
      "SELECT * FROM crit_api_outbox WHERE tenant_id = $1 AND entity_id = $2",
      [fixture.tenantId, entityId]
    );
    assert.ok(result.rows[0]);
    return result.rows[0] as Record<string, any>;
  }, pool);
}

async function getOutboxById(fixture: Fixture, id: string) {
  return withTenantTransaction({ tenantId: fixture.tenantId }, async (client) => {
    const result = await client.query(
      "SELECT * FROM crit_api_outbox WHERE tenant_id = $1 AND id = $2",
      [fixture.tenantId, id]
    );
    assert.ok(result.rows[0]);
    return result.rows[0] as Record<string, any>;
  }, pool);
}

async function cleanupFixture(fixture: Fixture) {
  await withTenantTransaction({ tenantId: fixture.tenantId, userId: fixture.actorId }, async (client) => {
    await client.query("DELETE FROM crit_api_outbox WHERE tenant_id = $1 AND (entity_id IN ($2, $3) OR entity_type LIKE '%test')", [fixture.tenantId, fixture.appointmentId, fixture.rollbackAppointmentId]);
    await client.query("DELETE FROM crit_api_outbox WHERE tenant_id = $1 AND entity_type = 'attendance' AND payload->>'tenantCode' IS NOT NULL AND payload->'data'->>'appointmentId' IN ($2, $3)", [fixture.tenantId, fixture.appointmentId, fixture.rollbackAppointmentId]);
    await client.query("DELETE FROM attendance_records WHERE tenant_id = $1 AND appointment_id IN ($2, $3)", [fixture.tenantId, fixture.appointmentId, fixture.rollbackAppointmentId]);
    await client.query("DELETE FROM appointments WHERE tenant_id = $1 AND id IN ($2, $3)", [fixture.tenantId, fixture.appointmentId, fixture.rollbackAppointmentId]);
    await client.query("DELETE FROM collaborator_clinics WHERE tenant_id = $1 AND collaborator_id = $2", [fixture.tenantId, fixture.collaboratorId]);
    await client.query("DELETE FROM rooms WHERE tenant_id = $1 AND id = $2", [fixture.tenantId, fixture.roomId]);
    await client.query("DELETE FROM clinics WHERE tenant_id = $1 AND id = $2", [fixture.tenantId, fixture.clinicId]);
    await client.query("DELETE FROM appointment_types WHERE tenant_id = $1 AND id = $2", [fixture.tenantId, fixture.appointmentTypeId]);
    await client.query("DELETE FROM collaborators WHERE tenant_id = $1 AND id = $2", [fixture.tenantId, fixture.collaboratorId]);
    await client.query("DELETE FROM patients WHERE tenant_id = $1 AND id = $2", [fixture.tenantId, fixture.patientId]);
    await client.query("DELETE FROM users WHERE tenant_id = $1 AND id = $2", [fixture.tenantId, fixture.userId]);
  }, pool);
}

function listenMockApi(
  handler: (headers: Record<string, string | string[] | undefined>, body: string) => number
): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        response.statusCode = handler(request.headers, body);
        response.end();
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Unable to bind mock API");
      resolve({ server, url: `http://127.0.0.1:${address.port}/events` });
    });
  });
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

run().catch((error: unknown) => {
  console.error("Outbox integration checks failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown error"
  });
  process.exitCode = 1;
});
