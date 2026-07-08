import assert from "node:assert/strict";
import { test } from "node:test";

import { listAdminCatalogsSchema, listAuditLogsSchema } from "./admin-catalogs.validation.js";

const uuid = "11111111-1111-4111-8111-111111111111";

test("admin catalog list validation supports includeDeleted query strings", () => {
  assert.deepEqual(listAdminCatalogsSchema.parse({}), { includeDeleted: false });
  assert.deepEqual(listAdminCatalogsSchema.parse({ includeDeleted: "true" }), { includeDeleted: true });
});

test("audit log validation paginates and filters by audited entity", () => {
  const input = listAuditLogsSchema.parse({
    page: "2",
    pageSize: "10",
    entityType: "users",
    entityId: uuid
  });

  assert.deepEqual(input, {
    page: 2,
    pageSize: 10,
    entityType: "users",
    entityId: uuid
  });
});
