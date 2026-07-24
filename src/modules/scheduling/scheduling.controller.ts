import type { RequestHandler } from "express";

import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { SchedulingService } from "./scheduling.service.js";
import { appointmentRecommendationsSchema } from "./scheduling.validation.js";

export class SchedulingController {
  constructor(private readonly service: SchedulingService) {}

  readonly recommend: RequestHandler = async (request, response) => {
    const input = parseWithSchema(appointmentRecommendationsSchema, request.body);
    sendSuccess(response, await this.service.recommend(request.auth!, input));
  };
}
