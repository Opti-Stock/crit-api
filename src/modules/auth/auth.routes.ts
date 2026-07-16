import { Router } from "express";
import type { SignOptions } from "jsonwebtoken";

import { env } from "../../config/env.js";
import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { AuthController } from "./auth.controller.js";
import { AuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";
import { createRateLimit } from "../../middlewares/rate-limit.middleware.js";

const repository = new AuthRepository();
const service = new AuthService(repository, {
  secret: env.JWT_SECRET,
  expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE
});
const controller = new AuthController(service);

export const authRouter = Router();

authRouter.post("/login", createRateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  maxRequests: env.LOGIN_RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: "login",
  identity: (request) => typeof request.body?.email === "string" ? request.body.email : undefined
}), controller.login);
authRouter.post("/logout", controller.logout);
authRouter.get("/me", authenticateRequest, requireTenantContext, controller.me);
