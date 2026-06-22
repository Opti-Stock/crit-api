import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { ClinicsController } from "./clinics.controller.js";
import { CLINIC_READ_ROLES } from "./clinics.constants.js";

const controller = new ClinicsController();
export const clinicsRouter = Router();

clinicsRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles(...CLINIC_READ_ROLES)
);
clinicsRouter.get("/", controller.list);
clinicsRouter.get("/:clinicId", controller.get);
