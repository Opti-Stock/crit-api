import assert from "node:assert/strict";
import { test } from "node:test";

import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";

import { AppError } from "../shared/errors/app-error.js";
import { createAuthenticationMiddleware } from "./authentication.middleware.js";
import { requireRoles } from "./role.middleware.js";
import { requireTenantContext } from "./tenant.middleware.js";

const config = {
  secret: "test-secret-that-is-at-least-32-characters-long",
  issuer: "crit-api-test",
  audience: "crit-assist-test"
};

const userId = "20000000-0000-0000-0000-000000000001";
const tenantId = "00000000-0000-0000-0000-000000000001";

function createRequest(options: {
  authorization?: string;
  body?: unknown;
  query?: Record<string, unknown>;
  tenantHeader?: string;
} = {}): Request {
  const headers: Record<string, string | undefined> = {
    authorization: options.authorization,
    "x-tenant-id": options.tenantHeader
  };

  return {
    body: options.body ?? {},
    query: options.query ?? {},
    header: (name: string) => headers[name.toLowerCase()]
  } as Request;
}

async function runMiddleware(
  middleware: RequestHandler,
  request: Request
): Promise<unknown> {
  return new Promise((resolve) => {
    middleware(
      request,
      {} as Response,
      ((error?: unknown) => resolve(error)) as NextFunction
    );
  });
}

function signToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    { tenantId, roles: ["admin"], ...overrides },
    config.secret,
    {
      algorithm: "HS256",
      subject: userId,
      expiresIn: "8h",
      issuer: config.issuer,
      audience: config.audience
    }
  );
}

test("authentication attaches only validated JWT context", async () => {
  const request = createRequest({ authorization: `Bearer ${signToken()}` });
  const error = await runMiddleware(createAuthenticationMiddleware(config), request);

  assert.equal(error, undefined);
  assert.deepEqual(request.auth, { userId, tenantId, roles: ["admin"] });
});

test("authentication rejects absent, altered, expired, issuer, and audience tokens", async () => {
  const tokens = [
    undefined,
    `${signToken()}altered`,
    jwt.sign({ tenantId, roles: ["admin"] }, config.secret, {
      subject: userId,
      expiresIn: -1,
      issuer: config.issuer,
      audience: config.audience
    }),
    jwt.sign({ tenantId, roles: ["admin"] }, config.secret, {
      subject: userId,
      expiresIn: "8h",
      issuer: "wrong-issuer",
      audience: config.audience
    }),
    jwt.sign({ tenantId, roles: ["admin"] }, config.secret, {
      subject: userId,
      expiresIn: "8h",
      issuer: config.issuer,
      audience: "wrong-audience"
    })
  ];

  for (const token of tokens) {
    const request = createRequest({
      authorization: token ? `Bearer ${token}` : undefined
    });
    const error = await runMiddleware(createAuthenticationMiddleware(config), request);
    assert.ok(error instanceof AppError);
    assert.equal(error.code, "AUTHENTICATION_REQUIRED");
  }
});

test("tenant context rejects client-provided tenant selectors", async () => {
  for (const request of [
    createRequest({ body: { tenantId } }),
    createRequest({ query: { tenant_id: tenantId } }),
    createRequest({ tenantHeader: tenantId })
  ]) {
    request.auth = { userId, tenantId, roles: ["admin"] };
    const error = await runMiddleware(requireTenantContext, request);
    assert.ok(error instanceof AppError);
    assert.equal(error.code, "TENANT_CONTEXT_OVERRIDE_NOT_ALLOWED");
  }
});

test("role middleware allows configured roles and denies reception clinical access", async () => {
  const allowedRequest = createRequest();
  allowedRequest.auth = { userId, tenantId, roles: ["terapeuta"] };
  assert.equal(
    await runMiddleware(requireRoles("medico", "terapeuta"), allowedRequest),
    undefined
  );

  const receptionRequest = createRequest();
  receptionRequest.auth = { userId, tenantId, roles: ["recepcion"] };
  const error = await runMiddleware(
    requireRoles("medico", "terapeuta"),
    receptionRequest
  );
  assert.ok(error instanceof AppError);
  assert.equal(error.code, "INSUFFICIENT_ROLE");
});

test("a medico and coordinador can use either role capability", async () => {
  const request = createRequest();
  request.auth = { userId, tenantId, roles: ["medico", "coordinador"] };

  assert.equal(await runMiddleware(requireRoles("medico"), request), undefined);
  assert.equal(await runMiddleware(requireRoles("coordinador"), request), undefined);
});
