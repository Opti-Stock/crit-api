import type { RequestHandler } from "express";
import jwt, { type VerifyOptions } from "jsonwebtoken";
import { z } from "zod";

import { UnauthorizedError } from "../shared/errors/app-error.js";
import { readCookie, SESSION_COOKIE } from "../config/cookies.js";
import { env } from "../config/env.js";
import type { AuthenticatedRequestContext } from "../types/global.js";

export interface AuthenticationConfig {
  secret: string;
  issuer: string;
  audience: string;
}

const postgresUuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
);

const accessTokenSchema = z.object({
  sub: postgresUuidSchema,
  tenantId: postgresUuidSchema,
  roles: z.array(z.string().min(1))
});

const authenticationError = () =>
  new UnauthorizedError("Authentication required", "AUTHENTICATION_REQUIRED");

export function createAuthenticationMiddleware(
  config: AuthenticationConfig
): RequestHandler {
  const verifyOptions: VerifyOptions = {
    algorithms: ["HS256"],
    issuer: config.issuer,
    audience: config.audience
  };

  return (request, _response, next) => {
    const authorization = request.header("authorization");
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    const token = readCookie(request, SESSION_COOKIE) ?? (env.BEARER_AUTH_ENABLED ? match?.[1] : undefined);

    if (!token) {
      next(authenticationError());
      return;
    }

    try {
      const decoded = jwt.verify(token, config.secret, verifyOptions);
      const parsed = accessTokenSchema.safeParse(decoded);

      if (!parsed.success) {
        next(authenticationError());
        return;
      }

      const auth: AuthenticatedRequestContext = {
        userId: parsed.data.sub,
        tenantId: parsed.data.tenantId,
        roles: [...parsed.data.roles]
      };
      request.auth = auth;
      next();
    } catch {
      next(authenticationError());
    }
  };
}
