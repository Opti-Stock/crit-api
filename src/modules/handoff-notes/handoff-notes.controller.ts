import type { RequestHandler } from "express";

import { NotFoundError } from "../../shared/errors/app-error.js";
import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { HandoffNotesService } from "./handoff-notes.service.js";
import {
  createHandoffNoteSchema,
  handoffNoteIdParamsSchema,
  listHandoffNotesSchema
} from "./handoff-notes.validation.js";

export class HandoffNotesController {
  constructor(private readonly service = new HandoffNotesService()) {}

  readonly list: RequestHandler = async (request, response) => {
    const input = parseWithSchema(listHandoffNotesSchema, request.query);
    const result = await this.service.list(request.auth!, input);
    sendSuccess(response, result.notes, 200, {
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize)
    });
  };

  readonly get: RequestHandler = async (request, response) => {
    const { handoffNoteId } = parseWithSchema(handoffNoteIdParamsSchema, request.params);
    const note = await this.service.get(request.auth!, handoffNoteId);
    if (!note) throw new NotFoundError("Handoff note not found", "HANDOFF_NOTE_NOT_FOUND");
    sendSuccess(response, note);
  };

  readonly create: RequestHandler = async (request, response) => {
    const input = parseWithSchema(createHandoffNoteSchema, request.body);
    sendSuccess(response, await this.service.create(request.auth!, input), 201);
  };

  readonly markAsRead: RequestHandler = async (request, response) => {
    const { handoffNoteId } = parseWithSchema(handoffNoteIdParamsSchema, request.params);
    sendSuccess(response, await this.service.markAsRead(request.auth!, handoffNoteId));
  };
}
