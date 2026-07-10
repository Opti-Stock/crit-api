import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveScope } from "./attendance.service.js";

test("admin and direccion get tenant-wide access", () => {
  assert.equal(resolveScope(["admin"]).tenantWide, true);
  assert.equal(resolveScope(["direccion"]).tenantWide, true);
});

test("recepcion and coordinador are scoped to their clinics", () => {
  assert.equal(resolveScope(["recepcion"]).clinics, true);
  assert.equal(resolveScope(["coordinador"]).clinics, true);
});

test("medico and terapeuta are scoped to their own attendance records", () => {
  assert.equal(resolveScope(["medico"]).ownCollaborator, true);
  assert.equal(resolveScope(["terapeuta"]).ownCollaborator, true);
});

test("medico and coordinador combine clinic and own attendance visibility", () => {
  assert.deepEqual(resolveScope(["medico", "coordinador"]), {
    tenantWide: false,
    clinics: true,
    ownCollaborator: true
  });
});

test("an unrecognized role receives no attendance scope", () => {
  assert.deepEqual(resolveScope(["personal_acompanamiento"]), {
    tenantWide: false,
    clinics: false,
    ownCollaborator: false
  });
  assert.deepEqual(resolveScope(["recepcion_general"]), {
    tenantWide: false,
    clinics: false,
    ownCollaborator: false
  });
});
