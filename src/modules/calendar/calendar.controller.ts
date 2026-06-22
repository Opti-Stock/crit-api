import type { RequestHandler } from "express";

import { sendSuccess } from "../../shared/responses/api-response.js";
import { CalendarService } from "./calendar.service.js";

export class CalendarController {
  constructor(private readonly service = new CalendarService()) {}

  readonly listAppointmentTypes: RequestHandler = async (request, response) => {
    const appointmentTypes = await this.service.listAppointmentTypes(request.auth!);
    sendSuccess(response, appointmentTypes);
  };
}
