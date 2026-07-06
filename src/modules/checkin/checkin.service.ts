import type { AuthenticatedRequestContext } from "../../types/global.js";
import { CheckinRepository } from "./checkin.repository.js";
import type { ListCheckinAppointmentsInput } from "./checkin.validation.js";

export class CheckinService {
  constructor(private readonly repository = new CheckinRepository()) {}

  listAppointments(context: AuthenticatedRequestContext, input: ListCheckinAppointmentsInput) {
    return this.repository.listAppointments(context.tenantId, context.userId, context.roles, input);
  }

  getAppointment(context: AuthenticatedRequestContext, appointmentId: string) {
    return this.repository.getAppointment(context.tenantId, context.userId, context.roles, appointmentId);
  }

  checkIn(context: AuthenticatedRequestContext, appointmentId: string) {
    return this.repository.checkIn(context.tenantId, context.userId, context.roles, appointmentId);
  }
}
