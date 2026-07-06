import type { RequestHandler } from "express";

import { NotFoundError } from "../../shared/errors/app-error.js";
import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { CheckinService } from "./checkin.service.js";
import {
  checkinAppointmentIdParamsSchema,
  listCheckinAppointmentsSchema
} from "./checkin.validation.js";

export class CheckinController {
  constructor(private readonly service = new CheckinService()) {}

  readonly listAppointments: RequestHandler = async (request, response) => {
    const input = parseWithSchema(listCheckinAppointmentsSchema, request.query);
    sendSuccess(response, await this.service.listAppointments(request.auth!, input));
  };

  readonly getAppointment: RequestHandler = async (request, response) => {
    const { appointmentId } = parseWithSchema(checkinAppointmentIdParamsSchema, request.params);
    const appointment = await this.service.getAppointment(request.auth!, appointmentId);
    if (!appointment) throw new NotFoundError("Appointment not found", "APPOINTMENT_NOT_FOUND");
    sendSuccess(response, appointment);
  };

  readonly checkIn: RequestHandler = async (request, response) => {
    const { appointmentId } = parseWithSchema(checkinAppointmentIdParamsSchema, request.params);
    sendSuccess(response, await this.service.checkIn(request.auth!, appointmentId), 201);
  };
}
