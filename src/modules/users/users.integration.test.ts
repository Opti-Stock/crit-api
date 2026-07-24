import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { pool } from "../../config/db.js";
import { UsersRepository } from "./users.repository.js";

const runIntegration = process.env.CRIT_DB_INTEGRATION === "1";

test("user delete and restore use the protected audit contract", {
  skip: !runIntegration
}, async () => {
  const tenantId = process.env.CRIT_DB_TEST_TENANT_ID;
  const actorId = process.env.CRIT_DB_TEST_USER_ID;
  assert.ok(tenantId, "CRIT_DB_TEST_TENANT_ID is required");
  assert.ok(actorId, "CRIT_DB_TEST_USER_ID is required");

  const repository = new UsersRepository(pool);
  const user = await repository.create(
    tenantId,
    actorId,
    {
      fullName: "Audit Contract User",
      email: `audit-contract-${randomUUID()}@crit.test`,
      password: "integration-only-password",
      roleIds: ["10000000-0000-0000-0000-000000000003"],
      clinicAccess: []
    },
    "integration-password-hash"
  );

  await repository.softDelete(
    tenantId,
    actorId,
    user.id,
    "integration user delete"
  );
  const restored = await repository.restore(
    tenantId,
    actorId,
    user.id,
    "integration user restore"
  );
  assert.equal(restored.status, "active");
  assert.equal(restored.deletedAt, null);

  await repository.softDelete(
    tenantId,
    actorId,
    user.id,
    "integration cleanup"
  );
});
