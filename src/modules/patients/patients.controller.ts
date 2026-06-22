import type { RequestHandler } from "express";

import { NotFoundError } from "../../shared/errors/app-error.js";
import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { PatientsService } from "./patients.service.js";
import { listPatientsSchema, patientIdParamsSchema } from "./patients.validation.js";

export class PatientsController {
  constructor(private readonly service = new PatientsService()) {}

  readonly list: RequestHandler = async (request, response) => {
    const input = parseWithSchema(listPatientsSchema, request.query);
    const result = await this.service.list(request.auth!, input);
    sendSuccess(response, result.patients, 200, {
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize)
    });
  };

  readonly get: RequestHandler = async (request, response) => {
    const { patientId } = parseWithSchema(patientIdParamsSchema, request.params);
    const patient = await this.service.get(request.auth!, patientId);
    if (!patient) throw new NotFoundError("Patient not found", "PATIENT_NOT_FOUND");
    sendSuccess(response, patient);
  };
}
