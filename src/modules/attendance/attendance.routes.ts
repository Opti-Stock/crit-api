import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { AttendanceController } from "./attendance.controller.js";

const controller = new AttendanceController();
export const attendanceRouter = Router();

attendanceRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion", "recepcion", "coordinador", "medico", "terapeuta")
);
attendanceRouter.get("/", controller.list);
attendanceRouter.get("/:attendanceId", controller.get);
attendanceRouter.post("/", requireRoles("medico", "terapeuta"), controller.create);
