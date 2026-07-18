import { Router } from "express";

import { authenticatePlatformRequest } from "../../middlewares/platform-authentication.middleware.js";
import { PlatformController } from "./platform.controller.js";
import { createRateLimit } from "../../middlewares/rate-limit.middleware.js";
import { env } from "../../config/env.js";

const controller = new PlatformController();

export const platformRouter = Router();

platformRouter.post("/auth/login", createRateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  maxRequests: env.LOGIN_RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: "platform-login",
  identity: (request) => typeof request.body?.email === "string" ? request.body.email : undefined
}), controller.login);
platformRouter.post("/auth/logout", controller.logout);
platformRouter.use(authenticatePlatformRequest);
platformRouter.get("/auth/me", controller.me);
platformRouter.get("/tenants", controller.listTenants);
platformRouter.post("/tenants", controller.createTenant);
platformRouter.get("/tenants/:tenantId", controller.getTenant);
platformRouter.patch("/tenants/:tenantId", controller.updateTenant);
platformRouter.post("/tenants/:tenantId/admin-users", controller.createFirstTenantAdmin);
