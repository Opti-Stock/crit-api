import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { AdminCatalogsController } from "./admin-catalogs.controller.js";

const controller = new AdminCatalogsController();

export const adminCatalogsRouter = Router();

adminCatalogsRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion")
);

adminCatalogsRouter.get("/clinics", controller.listClinics);
adminCatalogsRouter.post("/clinics", controller.createClinic);
adminCatalogsRouter.patch("/clinics/:id", controller.updateClinic);
adminCatalogsRouter.delete("/clinics/:id", controller.deleteClinic);
adminCatalogsRouter.post("/clinics/:id/restore", controller.restoreClinic);

adminCatalogsRouter.get("/patients", controller.listPatients);
adminCatalogsRouter.post("/patients", controller.createPatient);
adminCatalogsRouter.patch("/patients/:id", controller.updatePatient);

adminCatalogsRouter.get("/rooms", controller.listRooms);
adminCatalogsRouter.post("/rooms", controller.createRoom);
adminCatalogsRouter.patch("/rooms/:id", controller.updateRoom);
adminCatalogsRouter.delete("/rooms/:id", controller.deleteRoom);
adminCatalogsRouter.post("/rooms/:id/restore", controller.restoreRoom);

adminCatalogsRouter.get("/appointment-types", controller.listAppointmentTypes);
adminCatalogsRouter.post("/appointment-types", controller.createAppointmentType);
adminCatalogsRouter.patch("/appointment-types/:id", controller.updateAppointmentType);

adminCatalogsRouter.get("/collaborators", controller.listCollaborators);
adminCatalogsRouter.post("/collaborators", controller.createCollaborator);
adminCatalogsRouter.patch("/collaborators/:id", controller.updateCollaborator);

adminCatalogsRouter.get("/audit-logs", controller.listAuditLogs);
