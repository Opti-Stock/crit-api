import type { RequestHandler } from "express";

import { NotFoundError } from "../../shared/errors/app-error.js";
import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { AiAssistanceService } from "./ai-assistance.service.js";
import {
  createQuestionSchema,
  createSummarySchema,
  feedbackSchema,
  interactionParamsSchema,
  latestSummaryQuerySchema,
  listInteractionsQuerySchema,
  patientAiParamsSchema,
  summaryParamsSchema
} from "./ai-assistance.validation.js";

export class AiAssistanceController {
  constructor(private readonly service: AiAssistanceService) {}

  readonly requestSummary: RequestHandler = async (request, response) => {
    const { patientId } = parseWithSchema(patientAiParamsSchema, request.params);
    const { kind } = parseWithSchema(createSummarySchema, request.body);
    const result = await this.service.requestSummary(request.auth!, patientId, kind);
    sendSuccess(response, result.summary, result.created ? 202 : 200);
  };

  readonly latestSummary: RequestHandler = async (request, response) => {
    const { patientId } = parseWithSchema(patientAiParamsSchema, request.params);
    const { kind } = parseWithSchema(latestSummaryQuerySchema, request.query);
    const summary = await this.service.findLatestSummary(request.auth!, patientId, kind);
    if (!summary) throw new NotFoundError("Summary not found", "NOTE_SUMMARY_NOT_FOUND");
    sendSuccess(response, summary);
  };

  readonly getSummary: RequestHandler = async (request, response) => {
    const { summaryId } = parseWithSchema(summaryParamsSchema, request.params);
    const summary = await this.service.findSummary(request.auth!, summaryId);
    if (!summary) throw new NotFoundError("Summary not found", "NOTE_SUMMARY_NOT_FOUND");
    sendSuccess(response, summary);
  };

  readonly createQuestion: RequestHandler = async (request, response) => {
    const { patientId } = parseWithSchema(patientAiParamsSchema, request.params);
    const input = parseWithSchema(createQuestionSchema, request.body);
    sendSuccess(
      response,
      await this.service.createQuestion(request.auth!, patientId, input),
      202
    );
  };

  readonly getInteraction: RequestHandler = async (request, response) => {
    const { interactionId } = parseWithSchema(interactionParamsSchema, request.params);
    const interaction = await this.service.findInteraction(request.auth!, interactionId);
    if (!interaction) {
      throw new NotFoundError("AI interaction not found", "AI_INTERACTION_NOT_FOUND");
    }
    sendSuccess(response, interaction);
  };

  readonly listInteractions: RequestHandler = async (request, response) => {
    const { patientId } = parseWithSchema(patientAiParamsSchema, request.params);
    const input = parseWithSchema(listInteractionsQuerySchema, request.query);
    const result = await this.service.listInteractions(request.auth!, patientId, input);
    sendSuccess(response, result.interactions, 200, {
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize)
    });
  };

  readonly feedback: RequestHandler = async (request, response) => {
    const { interactionId } = parseWithSchema(interactionParamsSchema, request.params);
    const input = parseWithSchema(feedbackSchema, request.body);
    sendSuccess(
      response,
      await this.service.setFeedback(request.auth!, interactionId, input)
    );
  };
}
