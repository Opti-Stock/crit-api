import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { RoomsController } from "./rooms.controller.js";

const controller = new RoomsController();
export const roomsRouter = Router();

roomsRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion", "recepcion", "coordinador", "medico", "terapeuta", "personal_acompanamiento")
);
roomsRouter.get("/", controller.list);
roomsRouter.get("/:roomId", controller.get);
