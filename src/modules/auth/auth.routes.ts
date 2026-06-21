import { Router } from "express";
import type { SignOptions } from "jsonwebtoken";

import { env } from "../../config/env.js";
import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { AuthController } from "./auth.controller.js";
import { AuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";

const repository = new AuthRepository();
const service = new AuthService(repository, {
  secret: env.JWT_SECRET,
  expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE
});
const controller = new AuthController(service);

export const authRouter = Router();

authRouter.post("/login", controller.login);
authRouter.get("/me", authenticateRequest, requireTenantContext, controller.me);
