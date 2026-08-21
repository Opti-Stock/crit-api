import assert from "node:assert/strict";
import { test } from "node:test";

import { adminReasonSchema, listUsersSchema, userIdParamsSchema } from "./users.validation.js";

const uuid = "11111111-1111-4111-8111-111111111111";

test("users list validation supports deleted records opt-in", () => {
  assert.equal(listUsersSchema.parse({}).includeDeleted, false);
  assert.equal(listUsersSchema.parse({ includeDeleted: "true" }).includeDeleted, true);
});

test("users list validation supports admin filters and sort fields", () => {
  assert.deepEqual(
    listUsersSchema.parse({
      page: "2",
      pageSize: "10",
      search: "medico",
      status: "active",
      roleId: uuid,
      sortBy: "email",
      sortDir: "desc"
    }),
    {
      page: 2,
      pageSize: 10,
      search: "medico",
      status: "active",
      roleId: uuid,
      includeDeleted: false,
      sortBy: "email",
      sortDir: "desc"
    }
  );
  assert.throws(() => listUsersSchema.parse({ sortBy: "passwordHash" }));
});

test("user id params validate restore and delete contract ids", () => {
  assert.deepEqual(userIdParamsSchema.parse({ userId: uuid }), { userId: uuid });
  assert.throws(() => userIdParamsSchema.parse({ userId: "not-a-uuid" }));
});

test("user delete and restore reason validation is optional and bounded", () => {
  assert.deepEqual(adminReasonSchema.parse({}), {});
  assert.deepEqual(adminReasonSchema.parse({ reason: "Cambio operativo" }), { reason: "Cambio operativo" });
  assert.throws(() => adminReasonSchema.parse({ reason: "" }));
});
