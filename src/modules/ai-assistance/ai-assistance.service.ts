import { env } from "../../config/env.js";
import { ForbiddenError, ServiceUnavailableError } from "../../shared/errors/app-error.js";
import type { AuthenticatedRequestContext } from "../../types/global.js";
import { AiAssistanceRepository } from "./ai-assistance.repository.js";
import type {
  CreateQuestionInput,
  FeedbackInput,
  ListInteractionsInput,
  NoteKind
} from "./ai-assistance.validation.js";

const MEDICAL_AI_ROLES = new Set([
  "admin",
  "direccion",
  "coordinador",
  "medico",
  "terapeuta"
]);

export class AiAssistanceService {
  constructor(private readonly repository: AiAssistanceRepository) {}

  requestSummary(
    context: AuthenticatedRequestContext,
    patientId: string,
    kind: NoteKind
  ) {
    this.assertEnabled();
    this.assertKindAccess(context.roles, kind);
    return this.repository.requestSummary(context.tenantId, context.userId, patientId, kind);
  }

  findLatestSummary(
    context: AuthenticatedRequestContext,
    patientId: string,
    kind: NoteKind
  ) {
    this.assertKindAccess(context.roles, kind);
    return this.repository.findLatestSummary(context.tenantId, context.userId, patientId, kind);
  }

  findSummary(context: AuthenticatedRequestContext, summaryId: string) {
    return this.repository.findSummary(context.tenantId, context.userId, summaryId);
  }

  createQuestion(
    context: AuthenticatedRequestContext,
    patientId: string,
    input: CreateQuestionInput
  ) {
    this.assertEnabled();
    this.assertKindAccess(context.roles, input.kind);
    return this.repository.createInteraction(
      context.tenantId,
      context.userId,
      patientId,
      input.kind,
      input.question,
      env.AI_INTERACTION_RETENTION_DAYS
    );
  }

  findInteraction(context: AuthenticatedRequestContext, interactionId: string) {
    return this.repository.findInteraction(context.tenantId, context.userId, interactionId);
  }

  listInteractions(
    context: AuthenticatedRequestContext,
    patientId: string,
    input: ListInteractionsInput
  ) {
    this.assertKindAccess(context.roles, input.kind);
    return this.repository.listInteractions(context.tenantId, context.userId, patientId, input);
  }

  setFeedback(
    context: AuthenticatedRequestContext,
    interactionId: string,
    input: FeedbackInput
  ) {
    return this.repository.setFeedback(context.tenantId, context.userId, interactionId, input);
  }

  private assertEnabled() {
    if (!env.AI_ENABLED) {
      throw new ServiceUnavailableError(
        "AI assistance is temporarily unavailable",
        "AI_DISABLED"
      );
    }
  }

  private assertKindAccess(roles: string[], kind: NoteKind) {
    if (kind === "medical" && !roles.some((role) => MEDICAL_AI_ROLES.has(role))) {
      throw new ForbiddenError(
        "Medical AI assistance is not available for this role",
        "MEDICAL_AI_FORBIDDEN"
      );
    }
  }
}
