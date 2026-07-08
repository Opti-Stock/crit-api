import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { CheckinController } from "./checkin.controller.js";

const controller = new CheckinController();

export const checkinRouter = Router();

checkinRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion", "recepcion", "medico", "terapeuta")
);

checkinRouter.get("/appointments", controller.listAppointments);
checkinRouter.get("/appointments/:appointmentId", controller.getAppointment);
checkinRouter.post("/appointments/:appointmentId/check-in", controller.checkIn);
checkinRouter.post("/scan", controller.scanCheckIn);
