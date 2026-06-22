import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { ClinicsController } from "./clinics.controller.js";

const controller = new ClinicsController();
export const clinicsRouter = Router();

clinicsRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion", "recepcion", "coordinador", "medico", "terapeuta", "personal_acompanamiento")
);
clinicsRouter.get("/", controller.list);
clinicsRouter.get("/:clinicId", controller.get);
