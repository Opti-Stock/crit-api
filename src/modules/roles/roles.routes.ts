import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { RolesController } from "./roles.controller.js";

const controller = new RolesController();

export const rolesRouter = Router();
rolesRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion")
);
rolesRouter.get("/", controller.list);
