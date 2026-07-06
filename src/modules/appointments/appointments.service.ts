import type { AuthenticatedRequestContext } from "../../types/global.js";
import { resolveOperationalAccessScope } from "../../shared/access/operational-access-scope.js";
import type { AppointmentsRepository } from "./appointments.repository.js";
import type { CreateAppointmentInput, ListAppointmentsInput, UpdateAppointmentInput } from "./appointments.validation.js";

export class AppointmentsService {
  constructor(private readonly repository: AppointmentsRepository) {}

  list(context: AuthenticatedRequestContext, input: ListAppointmentsInput) {
    return this.repository.list(
      context.tenantId,
      context.userId,
      input,
      resolveOperationalAccessScope(context.roles)
    );
  }

  get(context: AuthenticatedRequestContext, appointmentId: string) {
    return this.repository.findById(
      context.tenantId,
      context.userId,
      appointmentId,
      resolveOperationalAccessScope(context.roles)
    );
  }

  create(context: AuthenticatedRequestContext, input: CreateAppointmentInput) {
    return this.repository.create(
      context.tenantId,
      context.userId,
      input,
      resolveOperationalAccessScope(context.roles)
    );
  }

  update(context: AuthenticatedRequestContext, appointmentId: string, input: UpdateAppointmentInput) {
    return this.repository.update(
      context.tenantId,
      context.userId,
      appointmentId,
      input,
      resolveOperationalAccessScope(context.roles)
    );
  }
}

export const resolveScope = resolveOperationalAccessScope;
