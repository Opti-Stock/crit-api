import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveOperationalAccessScope } from "./operational-access-scope.js";

test("tenant-wide roles supersede narrower scopes", () => {
  assert.deepEqual(resolveOperationalAccessScope(["medico", "admin", "coordinador"]), {
    tenantWide: true,
    clinics: false,
    ownCollaborator: false
  });
});

test("medico and coordinador combine their data scopes", () => {
  assert.deepEqual(resolveOperationalAccessScope(["medico", "coordinador"]), {
    tenantWide: false,
    clinics: true,
    ownCollaborator: true
  });
});

test("single roles retain their expected scope", () => {
  assert.deepEqual(resolveOperationalAccessScope(["coordinador"]), {
    tenantWide: false,
    clinics: true,
    ownCollaborator: false
  });
  assert.deepEqual(resolveOperationalAccessScope(["medico"]), {
    tenantWide: false,
    clinics: false,
    ownCollaborator: true
  });
});

test("unknown roles receive no operational data scope", () => {
  assert.deepEqual(resolveOperationalAccessScope(["personal_acompanamiento"]), {
    tenantWide: false,
    clinics: false,
    ownCollaborator: false
  });
});
