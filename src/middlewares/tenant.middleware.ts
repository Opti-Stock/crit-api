import type { RequestHandler } from "express";

import { BadRequestError, UnauthorizedError } from "../shared/errors/app-error.js";

const hasOwn = (value: unknown, key: string): boolean =>
  typeof value === "object" &&
  value !== null &&
  Object.prototype.hasOwnProperty.call(value, key);

export const requireTenantContext: RequestHandler = (request, _response, next) => {
  if (!request.auth) {
    next(new UnauthorizedError("Authentication required", "AUTHENTICATION_REQUIRED"));
    return;
  }

  const attemptsTenantOverride =
    request.header("x-tenant-id") !== undefined ||
    hasOwn(request.body, "tenantId") ||
    hasOwn(request.body, "tenant_id") ||
    hasOwn(request.query, "tenantId") ||
    hasOwn(request.query, "tenant_id");

  if (attemptsTenantOverride) {
    next(
      new BadRequestError(
        "Tenant context must come from authentication",
        "TENANT_CONTEXT_OVERRIDE_NOT_ALLOWED"
      )
    );
    return;
  }

  next();
};
