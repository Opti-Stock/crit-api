import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { AttendanceController } from "./attendance.controller.js";
import { AttendanceRepository } from "./attendance.repository.js";
import { AttendanceService } from "./attendance.service.js";

const repository = new AttendanceRepository();
const service = new AttendanceService(repository);
const controller = new AttendanceController(service);
export const attendanceRouter = Router();

attendanceRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion", "recepcion", "coordinador", "medico", "terapeuta")
);
attendanceRouter.get("/", controller.list);
attendanceRouter.get("/:attendanceId", controller.get);
attendanceRouter.post("/", requireRoles("medico", "terapeuta"), controller.create);
attendanceRouter.patch(
  "/:attendanceId",
  requireRoles("medico", "terapeuta"),
  controller.update
);
