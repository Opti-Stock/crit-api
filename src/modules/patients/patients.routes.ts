import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { PatientsController } from "./patients.controller.js";
import { PATIENT_READ_ROLES } from "./patients.constants.js";

const controller = new PatientsController();
export const patientsRouter = Router();

patientsRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles(...PATIENT_READ_ROLES)
);
patientsRouter.get("/", controller.list);
patientsRouter.get("/:patientId", controller.get);
