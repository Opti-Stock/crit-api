import type { RequestHandler } from "express";

import { NotFoundError } from "../../shared/errors/app-error.js";
import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { AppointmentsService } from "./appointments.service.js";
import {
  appointmentIdParamsSchema,
  createAppointmentSchema,
  listAppointmentsSchema
} from "./appointments.validation.js";

export class AppointmentsController {
  constructor(private readonly service: AppointmentsService) {}

  readonly list: RequestHandler = async (request, response) => {
    const input = parseWithSchema(listAppointmentsSchema, request.query);
    const result = await this.service.list(request.auth!, input);
    sendSuccess(response, result.appointments, 200, {
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize)
    });
  };

  readonly get: RequestHandler = async (request, response) => {
    const { appointmentId } = parseWithSchema(appointmentIdParamsSchema, request.params);
    const appointment = await this.service.get(request.auth!, appointmentId);
    if (!appointment) throw new NotFoundError("Appointment not found", "APPOINTMENT_NOT_FOUND");
    sendSuccess(response, appointment);
  };

  readonly create: RequestHandler = async (request, response) => {
    const input = parseWithSchema(createAppointmentSchema, request.body);
    sendSuccess(response, await this.service.create(request.auth!, input), 201);
  };
}
