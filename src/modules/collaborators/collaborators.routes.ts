import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { CollaboratorsController } from "./collaborators.controller.js";

const controller = new CollaboratorsController();
export const collaboratorsRouter = Router();

collaboratorsRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion", "recepcion", "coordinador", "medico", "terapeuta", "personal_acompanamiento")
);
collaboratorsRouter.get("/", controller.list);
collaboratorsRouter.get("/:collaboratorId", controller.get);
