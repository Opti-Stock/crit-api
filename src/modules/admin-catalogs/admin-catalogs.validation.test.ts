import assert from "node:assert/strict";
import { test } from "node:test";

import {
  adminReasonSchema,
  listAdminCatalogsSchema,
  listAppointmentTypesSchema,
  listAuditLogsSchema,
  listClinicsSchema,
  listRoomsSchema
} from "./admin-catalogs.validation.js";

const uuid = "11111111-1111-4111-8111-111111111111";

test("admin catalog list validation supports includeDeleted query strings", () => {
  assert.deepEqual(listAdminCatalogsSchema.parse({}), { includeDeleted: false });
  assert.deepEqual(listAdminCatalogsSchema.parse({ includeDeleted: "true" }), { includeDeleted: true });
});

test("admin catalog list validation supports pagination, filters and sorting", () => {
  assert.deepEqual(
    listClinicsSchema.parse({ page: "2", pageSize: "10", search: "norte", status: "active", includeDeleted: "true", sortBy: "capacity", sortDir: "desc" }),
    { page: 2, pageSize: 10, search: "norte", status: "active", includeDeleted: true, sortBy: "capacity", sortDir: "desc" }
  );
  assert.deepEqual(
    listRoomsSchema.parse({ clinicId: uuid, sortBy: "name" }),
    { page: 1, pageSize: 20, clinicId: uuid, includeDeleted: false, sortBy: "name", sortDir: "asc" }
  );
  assert.deepEqual(
    listAppointmentTypesSchema.parse({ search: "lenguaje", sortBy: "defaultDurationMinutes" }),
    { page: 1, pageSize: 20, search: "lenguaje", sortBy: "defaultDurationMinutes", sortDir: "asc" }
  );
  assert.throws(() => listClinicsSchema.parse({ sortBy: "deletedAt" }));
  assert.throws(() => listRoomsSchema.parse({ clinicId: "not-a-uuid" }));
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

test("admin catalog delete and restore reason validation is optional and bounded", () => {
  assert.deepEqual(adminReasonSchema.parse({}), {});
  assert.deepEqual(adminReasonSchema.parse({ reason: "Registro duplicado" }), { reason: "Registro duplicado" });
  assert.throws(() => adminReasonSchema.parse({ reason: "" }));
});
