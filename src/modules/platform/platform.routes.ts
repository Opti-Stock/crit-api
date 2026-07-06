import { Router } from "express";

import { authenticatePlatformRequest } from "../../middlewares/platform-authentication.middleware.js";
import { PlatformController } from "./platform.controller.js";

const controller = new PlatformController();

export const platformRouter = Router();

platformRouter.post("/auth/login", controller.login);
platformRouter.use(authenticatePlatformRequest);
platformRouter.get("/auth/me", controller.me);
platformRouter.get("/tenants", controller.listTenants);
platformRouter.post("/tenants", controller.createTenant);
platformRouter.get("/tenants/:tenantId", controller.getTenant);
platformRouter.patch("/tenants/:tenantId", controller.updateTenant);
platformRouter.post("/tenants/:tenantId/admin-users", controller.createFirstTenantAdmin);
