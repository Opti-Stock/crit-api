import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { UsersController } from "./users.controller.js";

const controller = new UsersController();
export const usersRouter = Router();

usersRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion")
);
usersRouter.get("/", controller.list);
usersRouter.post("/", controller.create);
usersRouter.get("/:userId", controller.get);
usersRouter.patch("/:userId", controller.update);
usersRouter.delete("/:userId", controller.delete);
usersRouter.post("/:userId/restore", controller.restore);
usersRouter.put("/:userId/roles", controller.replaceRoles);
usersRouter.put("/:userId/clinic-access", controller.replaceClinicAccess);
usersRouter.put("/:userId/password", controller.updatePassword);
