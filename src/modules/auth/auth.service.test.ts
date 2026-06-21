import assert from "node:assert/strict";
import { test } from "node:test";

import jwt from "jsonwebtoken";

import { UnauthorizedError } from "../../shared/errors/app-error.js";
import type {
  AuthCredentialRecord,
  AuthRepositoryContract
} from "./auth.repository.js";
import { AuthService, type AuthTokenConfig } from "./auth.service.js";
import { loginSchema } from "./auth.validation.js";

const credentials: AuthCredentialRecord = {
  id: "20000000-0000-0000-0000-000000000001",
  tenantId: "00000000-0000-0000-0000-000000000001",
  fullName: "Test Administrator",
  email: "admin@test.local",
  passwordHash: "stored-hash",
  roles: ["admin"]
};

const tokenConfig: AuthTokenConfig = {
  secret: "test-secret-that-is-at-least-32-characters-long",
  expiresIn: "8h",
  issuer: "crit-api-test",
  audience: "crit-assist-test"
};

class FakeAuthRepository implements AuthRepositoryContract {
  tenantId: string | null = credentials.tenantId;
  credentialRecord: AuthCredentialRecord | null = credentials;
  recordedLogin: { tenantId: string; userId: string } | null = null;

  async findTenantIdByCode(): Promise<string | null> {
    return this.tenantId;
  }

  async findActiveCredentials(): Promise<AuthCredentialRecord | null> {
    return this.credentialRecord;
  }

  async recordSuccessfulLogin(tenantId: string, userId: string): Promise<void> {
    this.recordedLogin = { tenantId, userId };
  }
}

test("login validation normalizes tenant code and email", () => {
  const result = loginSchema.parse({
    tenantCode: " crit-occ-01 ",
    email: " Admin@Test.Local ",
    password: "secret"
  });

  assert.equal(result.tenantCode, "CRIT-OCC-01");
  assert.equal(result.email, "admin@test.local");
});

test("login returns a signed token and a password-free user", async () => {
  const repository = new FakeAuthRepository();
  const service = new AuthService(repository, tokenConfig, async () => true);

  const result = await service.login({
    tenantCode: "CRIT-OCC-01",
    email: credentials.email,
    password: "valid-password"
  });

  assert.equal(result.tokenType, "Bearer");
  assert.equal(result.expiresIn, "8h");
  assert.deepEqual(result.user, {
    id: credentials.id,
    tenantId: credentials.tenantId,
    fullName: credentials.fullName,
    email: credentials.email,
    roles: credentials.roles
  });
  assert.equal("passwordHash" in result.user, false);
  assert.deepEqual(repository.recordedLogin, {
    tenantId: credentials.tenantId,
    userId: credentials.id
  });

  const payload = jwt.verify(result.accessToken, tokenConfig.secret, {
    algorithms: ["HS256"],
    issuer: tokenConfig.issuer,
    audience: tokenConfig.audience
  });
  assert.notEqual(typeof payload, "string");
  if (typeof payload === "string") {
    assert.fail("Expected a JWT object payload");
  }
  assert.equal(payload.sub, credentials.id);
  assert.equal(payload.tenantId, credentials.tenantId);
  assert.deepEqual(payload.roles, ["admin"]);
});

test("login rejects an unknown tenant with the generic error", async () => {
  const repository = new FakeAuthRepository();
  repository.tenantId = null;
  const service = new AuthService(repository, tokenConfig, async () => true);

  await assert.rejects(
    service.login({ tenantCode: "UNKNOWN", email: credentials.email, password: "secret" }),
    (error: unknown) =>
      error instanceof UnauthorizedError && error.code === "INVALID_CREDENTIALS"
  );
});

test("login rejects an inactive or missing user with the generic error", async () => {
  const repository = new FakeAuthRepository();
  repository.credentialRecord = null;
  const service = new AuthService(repository, tokenConfig, async () => true);

  await assert.rejects(
    service.login({ tenantCode: "CRIT-OCC-01", email: credentials.email, password: "secret" }),
    (error: unknown) =>
      error instanceof UnauthorizedError && error.code === "INVALID_CREDENTIALS"
  );
});

test("login rejects an invalid password without recording the login", async () => {
  const repository = new FakeAuthRepository();
  const service = new AuthService(repository, tokenConfig, async () => false);

  await assert.rejects(
    service.login({ tenantCode: "CRIT-OCC-01", email: credentials.email, password: "wrong" }),
    (error: unknown) =>
      error instanceof UnauthorizedError && error.code === "INVALID_CREDENTIALS"
  );
  assert.equal(repository.recordedLogin, null);
});
