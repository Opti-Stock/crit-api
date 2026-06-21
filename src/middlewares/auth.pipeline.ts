import { env } from "../config/env.js";
import { createAuthenticationMiddleware } from "./authentication.middleware.js";

export const authenticateRequest = createAuthenticationMiddleware({
  secret: env.JWT_SECRET,
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE
});
