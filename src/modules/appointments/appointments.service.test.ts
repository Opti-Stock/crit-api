import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveScope } from "./appointments.service.js";

test("admin and direccion get tenant-wide access", () => {
  assert.equal(resolveScope(["admin"]).tenantWide, true);
  assert.equal(resolveScope(["direccion"]).tenantWide, true);
});

test("recepcion and coordinador are scoped to their clinics", () => {
  assert.equal(resolveScope(["recepcion"]).clinics, true);
  assert.equal(resolveScope(["coordinador"]).clinics, true);
});

test("medico and terapeuta are scoped to their own appointments", () => {
  assert.equal(resolveScope(["medico"]).ownCollaborator, true);
  assert.equal(resolveScope(["terapeuta"]).ownCollaborator, true);
});

test("an admin role takes precedence over a narrower secondary role", () => {
  assert.deepEqual(resolveScope(["medico", "admin"]), {
    tenantWide: true,
    clinics: false,
    ownCollaborator: false
  });
});

test("medico and coordinador combine clinic and own appointment visibility", () => {
  assert.deepEqual(resolveScope(["medico", "coordinador"]), {
    tenantWide: false,
    clinics: true,
    ownCollaborator: true
  });
});

test("an unrecognized role receives no appointment scope", () => {
  assert.deepEqual(resolveScope(["personal_acompanamiento"]), {
    tenantWide: false,
    clinics: false,
    ownCollaborator: false
  });
});
