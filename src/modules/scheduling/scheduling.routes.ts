import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { SchedulingConfigController } from "./scheduling-config.controller.js";
import { SchedulingController } from "./scheduling.controller.js";
import { SchedulingRepository } from "./scheduling.repository.js";
import { SchedulingService } from "./scheduling.service.js";

const repository = new SchedulingRepository();
const service = new SchedulingService(repository);
const controller = new SchedulingController(service);
const configController = new SchedulingConfigController();

export const schedulingRouter = Router();

schedulingRouter.use(
  authenticateRequest,
  requireTenantContext
);
schedulingRouter.post(
  "/appointments/recommendations",
  requireRoles("admin", "direccion", "recepcion", "coordinador"),
  controller.recommend
);

const schedulingManagers = requireRoles("admin", "coordinador");
const preferenceManagers = requireRoles("admin", "recepcion", "coordinador");

schedulingRouter.get(
  "/scheduling/clinics/:clinicId/operating-hours",
  schedulingManagers,
  configController.listOperatingHours
);
schedulingRouter.put(
  "/scheduling/clinics/:clinicId/operating-hours",
  schedulingManagers,
  configController.replaceOperatingHours
);
schedulingRouter.get(
  "/scheduling/clinics/:clinicId/appointment-types",
  schedulingManagers,
  configController.listClinicAppointmentTypes
);
schedulingRouter.put(
  "/scheduling/clinics/:clinicId/appointment-types",
  schedulingManagers,
  configController.replaceClinicAppointmentTypes
);
schedulingRouter.get(
  "/scheduling/clinics/:clinicId/collaborators/:collaboratorId/appointment-types",
  schedulingManagers,
  configController.listCollaboratorAppointmentTypes
);
schedulingRouter.put(
  "/scheduling/clinics/:clinicId/collaborators/:collaboratorId/appointment-types",
  schedulingManagers,
  configController.replaceCollaboratorAppointmentTypes
);
schedulingRouter.get(
  "/scheduling/clinics/:clinicId/rooms/:roomId/appointment-types",
  schedulingManagers,
  configController.listRoomAppointmentTypes
);
schedulingRouter.put(
  "/scheduling/clinics/:clinicId/rooms/:roomId/appointment-types",
  schedulingManagers,
  configController.replaceRoomAppointmentTypes
);
schedulingRouter.get(
  "/scheduling/clinics/:clinicId/blocks",
  schedulingManagers,
  configController.listBlocks
);
schedulingRouter.post(
  "/scheduling/clinics/:clinicId/blocks",
  schedulingManagers,
  configController.createBlock
);
schedulingRouter.delete(
  "/scheduling/clinics/:clinicId/blocks/:blockId",
  schedulingManagers,
  configController.deleteBlock
);
schedulingRouter.get(
  "/scheduling/clinics/:clinicId/patients/:patientId/preferences",
  preferenceManagers,
  configController.listPatientPreferences
);
schedulingRouter.put(
  "/scheduling/clinics/:clinicId/patients/:patientId/preferences",
  preferenceManagers,
  configController.replacePatientPreferences
);
