import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";

import { pool } from "../../config/db.js";
import { AdminCatalogsRepository } from "./admin-catalogs.repository.js";

const runIntegration = process.env.CRIT_DB_INTEGRATION === "1";

test("admin catalog integration supports clinic create delete and restore", { skip: !runIntegration }, async () => {
  const tenantId = process.env.CRIT_DB_TEST_TENANT_ID;
  const actorId = process.env.CRIT_DB_TEST_USER_ID;
  assert.ok(tenantId, "CRIT_DB_TEST_TENANT_ID is required");
  assert.ok(actorId, "CRIT_DB_TEST_USER_ID is required");

  const repository = new AdminCatalogsRepository(pool);
  const name = `Integration Clinic ${randomUUID()}`;

  const created = await repository.createClinic(tenantId, actorId, {
    name,
    capacity: 1
  });

  await repository.softDeleteClinic(tenantId, actorId, created.id, "integration delete");
  const deleted = await repository.listClinics(tenantId, actorId, {
    page: 1,
    pageSize: 20,
    search: name,
    includeDeleted: true,
    sortBy: "name",
    sortDir: "asc"
  });
  assert.equal(deleted.total, 1);
  assert.ok(deleted.clinics.some((clinic) => clinic.id === created.id && clinic.deletedAt));

  const restored = await repository.restoreClinic(tenantId, actorId, created.id, "integration restore");
  assert.equal(restored.deletedAt, null);
});
