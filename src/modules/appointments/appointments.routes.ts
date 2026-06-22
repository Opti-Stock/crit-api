import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { AppointmentsController } from "./appointments.controller.js";

const controller = new AppointmentsController();
export const appointmentsRouter = Router();

appointmentsRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion", "recepcion", "coordinador", "medico", "terapeuta")
);
appointmentsRouter.get("/", controller.list);
appointmentsRouter.get("/:appointmentId", controller.get);
appointmentsRouter.post(
  "/",
  requireRoles("admin", "direccion", "recepcion", "coordinador"),
  controller.create
);
