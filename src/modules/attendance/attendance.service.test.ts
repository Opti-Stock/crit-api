import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveScope } from "./attendance.service.js";

test("admin and direccion get tenant-wide access", () => {
  assert.deepEqual(resolveScope(["admin"]), { kind: "all" });
  assert.deepEqual(resolveScope(["direccion"]), { kind: "all" });
});

test("recepcion and coordinador are scoped to their clinics", () => {
  assert.deepEqual(resolveScope(["recepcion"]), { kind: "clinics" });
  assert.deepEqual(resolveScope(["coordinador"]), { kind: "clinics" });
});

test("medico and terapeuta are scoped to their own attendance records", () => {
  assert.deepEqual(resolveScope(["medico"]), { kind: "own-collaborator" });
  assert.deepEqual(resolveScope(["terapeuta"]), { kind: "own-collaborator" });
});

test("an unrecognized role combination defaults to the narrowest scope", () => {
  assert.deepEqual(resolveScope(["personal_acompanamiento"]), { kind: "own-collaborator" });
});
