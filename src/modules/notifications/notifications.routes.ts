import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { NotificationsController } from "./notifications.controller.js";

const controller = new NotificationsController();
export const notificationsRouter = Router();

notificationsRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion", "recepcion", "coordinador", "medico", "terapeuta", "personal_acompanamiento")
);
notificationsRouter.get("/", controller.list);
notificationsRouter.get("/:notificationId", controller.get);
notificationsRouter.patch("/:notificationId/read", controller.markAsRead);
notificationsRouter.patch("/:notificationId/unread", controller.markAsUnread);
notificationsRouter.post("/", requireRoles("admin", "direccion"), controller.create);
