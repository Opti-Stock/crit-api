import type { RequestHandler } from "express";

import { NotFoundError } from "../../shared/errors/app-error.js";
import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { ClinicsService } from "./clinics.service.js";
import { clinicIdParamsSchema, listClinicsSchema } from "./clinics.validation.js";

export class ClinicsController {
  constructor(private readonly service = new ClinicsService()) {}

  readonly list: RequestHandler = async (request, response) => {
    const input = parseWithSchema(listClinicsSchema, request.query);
    const result = await this.service.list(request.auth!, input);
    sendSuccess(response, result.clinics, 200, {
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize)
    });
  };

  readonly get: RequestHandler = async (request, response) => {
    const { clinicId } = parseWithSchema(clinicIdParamsSchema, request.params);
    const clinic = await this.service.get(request.auth!, clinicId);
    if (!clinic) throw new NotFoundError("Clinic not found", "CLINIC_NOT_FOUND");
    sendSuccess(response, clinic);
  };
}
