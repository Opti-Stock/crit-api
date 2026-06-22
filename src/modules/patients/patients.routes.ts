import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { PatientsController } from "./patients.controller.js";

const controller = new PatientsController();
export const patientsRouter = Router();

patientsRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion", "recepcion", "coordinador", "medico", "terapeuta", "personal_acompanamiento")
);
patientsRouter.get("/", controller.list);
patientsRouter.get("/:patientId", controller.get);
