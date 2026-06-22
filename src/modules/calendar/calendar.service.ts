import type { AuthenticatedRequestContext } from "../../types/global.js";
import { CalendarRepository } from "./calendar.repository.js";

export class CalendarService {
  constructor(private readonly repository = new CalendarRepository()) {}

  listAppointmentTypes(context: AuthenticatedRequestContext) {
    return this.repository.listAppointmentTypes(context.tenantId, context.userId);
  }
}
