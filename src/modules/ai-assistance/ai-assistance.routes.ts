import { Router } from "express";

import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";
import { requireTenantContext } from "../../middlewares/tenant.middleware.js";
import { AiAssistanceController } from "./ai-assistance.controller.js";
import { AiAssistanceRepository } from "./ai-assistance.repository.js";
import { AiAssistanceService } from "./ai-assistance.service.js";

const repository = new AiAssistanceRepository();
const service = new AiAssistanceService(repository);
const controller = new AiAssistanceController(service);

export const aiAssistanceRouter = Router();
aiAssistanceRouter.use(
  authenticateRequest,
  requireTenantContext,
  requireRoles(
    "admin",
    "direccion",
    "recepcion",
    "coordinador",
    "medico",
    "terapeuta",
    "personal_acompanamiento"
  )
);

aiAssistanceRouter.post("/patients/:patientId/note-summaries", controller.requestSummary);
aiAssistanceRouter.get("/patients/:patientId/note-summaries/latest", controller.latestSummary);
aiAssistanceRouter.get("/note-summaries/:summaryId", controller.getSummary);
aiAssistanceRouter.post("/patients/:patientId/ai-questions", controller.createQuestion);
aiAssistanceRouter.get("/ai-interactions/:interactionId", controller.getInteraction);
aiAssistanceRouter.get("/patients/:patientId/ai-interactions", controller.listInteractions);
aiAssistanceRouter.post("/ai-interactions/:interactionId/feedback", controller.feedback);
