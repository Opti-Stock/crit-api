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
  roles: ["admin"],
  collaboratorId: null
};

const tokenConfig: AuthTokenConfig = {
  secret: "test-secret-that-is-at-least-32-characters-long",
  expiresIn: "8h",
  issuer: "crit-api-test",
  audience: "crit-assist-test"
};

class FakeAuthRepository implements AuthRepositoryContract {
  credentialRecords: AuthCredentialRecord[] = [credentials];
  recordedLogin: { tenantId: string; userId: string } | null = null;

  async findActiveCredentialsByEmail(): Promise<AuthCredentialRecord[]> {
    return this.credentialRecords;
  }

  async recordSuccessfulLogin(tenantId: string, userId: string): Promise<void> {
    this.recordedLogin = { tenantId, userId };
  }
}

test("login validation normalizes email", () => {
  const result = loginSchema.parse({
    email: " Admin@Test.Local ",
    password: "secret"
  });

  assert.equal(result.email, "admin@test.local");
});

test("login validation rejects tenant selectors", () => {
  assert.throws(() => loginSchema.parse({
    tenantCode: "CRIT-OCC-01",
    email: "admin@test.local",
    password: "secret"
  }));
});

test("login returns a signed token and a password-free user", async () => {
  const repository = new FakeAuthRepository();
  const service = new AuthService(repository, tokenConfig, async () => true);

  const result = await service.login({
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
    roles: credentials.roles,
    collaboratorId: null
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

test("login rejects missing credentials with the generic error", async () => {
  const repository = new FakeAuthRepository();
  repository.credentialRecords = [];
  const service = new AuthService(repository, tokenConfig, async () => true);

  await assert.rejects(
    service.login({ email: credentials.email, password: "secret" }),
    (error: unknown) =>
      error instanceof UnauthorizedError && error.code === "INVALID_CREDENTIALS"
  );
});

test("login rejects ambiguous email matches with the generic error", async () => {
  const repository = new FakeAuthRepository();
  repository.credentialRecords = [
    credentials,
    { ...credentials, id: "20000000-0000-0000-0000-000000000002", tenantId: "00000000-0000-0000-0000-000000000002" }
  ];
  const service = new AuthService(repository, tokenConfig, async () => true);

  await assert.rejects(
    service.login({ email: credentials.email, password: "secret" }),
    (error: unknown) =>
      error instanceof UnauthorizedError && error.code === "INVALID_CREDENTIALS"
  );
});

test("login rejects an invalid password without recording the login", async () => {
  const repository = new FakeAuthRepository();
  const service = new AuthService(repository, tokenConfig, async () => false);

  await assert.rejects(
    service.login({ email: credentials.email, password: "wrong" }),
    (error: unknown) =>
      error instanceof UnauthorizedError && error.code === "INVALID_CREDENTIALS"
  );
  assert.equal(repository.recordedLogin, null);
});
