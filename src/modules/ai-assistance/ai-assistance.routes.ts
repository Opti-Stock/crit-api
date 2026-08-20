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
const requireAiAssistanceAccess = [
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
] as const;

aiAssistanceRouter.post(
  "/patients/:patientId/note-summaries",
  ...requireAiAssistanceAccess,
  controller.requestSummary
);
aiAssistanceRouter.get(
  "/patients/:patientId/note-summaries/latest",
  ...requireAiAssistanceAccess,
  controller.latestSummary
);
aiAssistanceRouter.get(
  "/note-summaries/:summaryId",
  ...requireAiAssistanceAccess,
  controller.getSummary
);
aiAssistanceRouter.post(
  "/patients/:patientId/ai-questions",
  ...requireAiAssistanceAccess,
  controller.createQuestion
);
aiAssistanceRouter.get(
  "/ai-interactions/:interactionId",
  ...requireAiAssistanceAccess,
  controller.getInteraction
);
aiAssistanceRouter.get(
  "/patients/:patientId/ai-interactions",
  ...requireAiAssistanceAccess,
  controller.listInteractions
);
aiAssistanceRouter.post(
  "/ai-interactions/:interactionId/feedback",
  ...requireAiAssistanceAccess,
  controller.feedback
);
