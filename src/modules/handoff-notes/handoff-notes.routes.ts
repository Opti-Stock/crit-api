import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { HandoffNotesController } from "./handoff-notes.controller.js";

const controller = new HandoffNotesController();
export const handoffNotesRouter = Router();

handoffNotesRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles("admin", "direccion", "recepcion", "coordinador", "medico", "terapeuta", "personal_acompanamiento")
);
handoffNotesRouter.get("/", controller.list);
handoffNotesRouter.get("/:handoffNoteId", controller.get);
handoffNotesRouter.post(
  "/",
  requireRoles("recepcion", "coordinador", "medico", "terapeuta", "personal_acompanamiento"),
  controller.create
);
handoffNotesRouter.patch("/:handoffNoteId/read", controller.markAsRead);
