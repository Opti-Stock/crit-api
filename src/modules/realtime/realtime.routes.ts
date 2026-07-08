import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { RealtimeController } from "./realtime.controller.js";

const controller = new RealtimeController();
export const realtimeRouter = Router();

realtimeRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion", "recepcion", "coordinador", "medico", "terapeuta", "personal_acompanamiento")
);

realtimeRouter.get("/events", controller.stream);
