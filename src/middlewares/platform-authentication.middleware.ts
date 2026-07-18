import type { RequestHandler } from "express";
import jwt, { type SignOptions, type VerifyOptions } from "jsonwebtoken";
import { z } from "zod";

import { env } from "../config/env.js";
import { PLATFORM_SESSION_COOKIE, readCookie } from "../config/cookies.js";
import { UnauthorizedError } from "../shared/errors/app-error.js";

export interface PlatformTokenConfig {
  secret: string;
  expiresIn: SignOptions["expiresIn"];
  issuer: string;
  audience: string;
}

const postgresUuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
);

const platformAccessTokenSchema = z.object({
  sub: postgresUuidSchema,
  scope: z.literal("platform_super_admin")
});

const authenticationError = () =>
  new UnauthorizedError("Platform authentication required", "PLATFORM_AUTHENTICATION_REQUIRED");

export function createPlatformAuthenticationMiddleware(
  config: Omit<PlatformTokenConfig, "expiresIn">
): RequestHandler {
  const verifyOptions: VerifyOptions = {
    algorithms: ["HS256"],
    issuer: config.issuer,
    audience: config.audience
  };

  return (request, _response, next) => {
    const authorization = request.header("authorization");
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    const token = readCookie(request, PLATFORM_SESSION_COOKIE) ?? (env.BEARER_AUTH_ENABLED ? match?.[1] : undefined);

    if (!token) {
      next(authenticationError());
      return;
    }

    try {
      const decoded = jwt.verify(token, config.secret, verifyOptions);
      const parsed = platformAccessTokenSchema.safeParse(decoded);

      if (!parsed.success) {
        next(authenticationError());
        return;
      }

      request.platformAuth = { superAdminId: parsed.data.sub };
      next();
    } catch {
      next(authenticationError());
    }
  };
}

export const authenticatePlatformRequest = createPlatformAuthenticationMiddleware({
  secret: env.PLATFORM_JWT_SECRET,
  issuer: env.PLATFORM_JWT_ISSUER,
  audience: env.PLATFORM_JWT_AUDIENCE
});
