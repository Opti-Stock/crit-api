import type { RequestHandler } from "express";

import { NotFoundError } from "../../shared/errors/app-error.js";
import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { CollaboratorsService } from "./collaborators.service.js";
import { collaboratorIdParamsSchema, listCollaboratorsSchema } from "./collaborators.validation.js";

export class CollaboratorsController {
  constructor(private readonly service = new CollaboratorsService()) {}

  readonly list: RequestHandler = async (request, response) => {
    const input = parseWithSchema(listCollaboratorsSchema, request.query);
    const result = await this.service.list(request.auth!, input);
    sendSuccess(response, result.collaborators, 200, {
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize)
    });
  };

  readonly get: RequestHandler = async (request, response) => {
    const { collaboratorId } = parseWithSchema(collaboratorIdParamsSchema, request.params);
    const collaborator = await this.service.get(request.auth!, collaboratorId);
    if (!collaborator) throw new NotFoundError("Collaborator not found", "COLLABORATOR_NOT_FOUND");
    sendSuccess(response, collaborator);
  };
}
