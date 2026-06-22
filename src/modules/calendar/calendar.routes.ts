import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { CalendarController } from "./calendar.controller.js";

const controller = new CalendarController();
export const calendarRouter = Router();

calendarRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion", "recepcion", "coordinador", "medico", "terapeuta")
);
calendarRouter.get("/appointment-types", controller.listAppointmentTypes);
