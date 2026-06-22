import type { RequestHandler } from "express";

import { NotFoundError } from "../../shared/errors/app-error.js";
import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { MedicalNotesService } from "./medical-notes.service.js";
import {
  createMedicalNoteSchema,
  listMedicalNotesSchema,
  medicalNoteIdParamsSchema
} from "./medical-notes.validation.js";

export class MedicalNotesController {
  constructor(private readonly service = new MedicalNotesService()) {}

  readonly list: RequestHandler = async (request, response) => {
    const input = parseWithSchema(listMedicalNotesSchema, request.query);
    const result = await this.service.list(request.auth!, input);
    sendSuccess(response, result.notes, 200, {
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize)
    });
  };

  readonly get: RequestHandler = async (request, response) => {
    const { medicalNoteId } = parseWithSchema(medicalNoteIdParamsSchema, request.params);
    const note = await this.service.get(request.auth!, medicalNoteId);
    if (!note) throw new NotFoundError("Medical note not found", "MEDICAL_NOTE_NOT_FOUND");
    sendSuccess(response, note);
  };

  readonly create: RequestHandler = async (request, response) => {
    const input = parseWithSchema(createMedicalNoteSchema, request.body);
    sendSuccess(response, await this.service.create(request.auth!, input), 201);
  };
}
