import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { RoomsController } from "./rooms.controller.js";
import { ROOM_READ_ROLES } from "./rooms.constants.js";

const controller = new RoomsController();
export const roomsRouter = Router();

roomsRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles(...ROOM_READ_ROLES)
);
roomsRouter.get("/", controller.list);
roomsRouter.get("/:roomId", controller.get);
