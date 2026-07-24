import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { SchedulingController } from "./scheduling.controller.js";
import { SchedulingRepository } from "./scheduling.repository.js";
import { SchedulingService } from "./scheduling.service.js";

const repository = new SchedulingRepository();
const service = new SchedulingService(repository);
const controller = new SchedulingController(service);

export const schedulingRouter = Router();

schedulingRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion", "recepcion", "coordinador")
);
schedulingRouter.post("/appointments/recommendations", controller.recommend);
