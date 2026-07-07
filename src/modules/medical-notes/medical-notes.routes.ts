import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { MedicalNotesController } from "./medical-notes.controller.js";

const controller = new MedicalNotesController();
export const medicalNotesRouter = Router();

medicalNotesRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion", "coordinador", "medico", "terapeuta")
);
medicalNotesRouter.get("/", controller.list);
medicalNotesRouter.get("/:medicalNoteId", controller.get);
medicalNotesRouter.post("/", requireRoles("medico", "terapeuta"), controller.create);
medicalNotesRouter.patch("/:medicalNoteId", requireRoles("medico", "terapeuta"), controller.update);
