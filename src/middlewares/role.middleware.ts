import type { RequestHandler } from "express";

import { ForbiddenError, UnauthorizedError } from "../shared/errors/app-error.js";

export function requireRoles(...allowedRoles: string[]): RequestHandler {
  const allowed = new Set(allowedRoles);

  return (request, _response, next) => {
    if (!request.auth) {
      next(new UnauthorizedError("Authentication required", "AUTHENTICATION_REQUIRED"));
      return;
    }

    if (!request.auth.roles.some((role) => allowed.has(role))) {
      next(new ForbiddenError("Insufficient role", "INSUFFICIENT_ROLE"));
      return;
    }

    next();
  };
}
