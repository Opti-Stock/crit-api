import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { createRateLimit } from "../../middlewares/rate-limit.middleware.js";
import { CheckinController } from "./checkin.controller.js";

const controller = new CheckinController();
const scanRateLimit = createRateLimit({
  keyPrefix: "checkin-scan",
  windowMs: 60_000,
  maxRequests: 90
});

export const checkinRouter = Router();

checkinRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion", "recepcion", "recepcion_general", "medico", "terapeuta")
);

checkinRouter.get("/appointments", controller.listAppointments);
checkinRouter.get("/appointments/:appointmentId", controller.getAppointment);
checkinRouter.post("/appointments/:appointmentId/check-in", controller.checkIn);
checkinRouter.post("/scan", scanRateLimit, controller.scanCheckIn);
