import type { AuthenticatedRequestContext } from "../../types/global.js";
import { AppointmentsRepository, type AppointmentAccessScope } from "./appointments.repository.js";
import type { CreateAppointmentInput, ListAppointmentsInput } from "./appointments.validation.js";

const TENANT_WIDE_ROLES = ["admin", "direccion"];
const CLINIC_SCOPED_ROLES = ["recepcion", "coordinador"];
const OWN_COLLABORATOR_ROLES = ["medico", "terapeuta"];

export class AppointmentsService {
  constructor(private readonly repository = new AppointmentsRepository()) {}

  list(context: AuthenticatedRequestContext, input: ListAppointmentsInput) {
    return this.repository.list(context.tenantId, context.userId, input, resolveScope(context.roles));
  }

  get(context: AuthenticatedRequestContext, appointmentId: string) {
    return this.repository.findById(context.tenantId, context.userId, appointmentId);
  }

  create(context: AuthenticatedRequestContext, input: CreateAppointmentInput) {
    return this.repository.create(context.tenantId, context.userId, input);
  }
}

export function resolveScope(roles: string[]): AppointmentAccessScope {
  if (roles.some((role) => TENANT_WIDE_ROLES.includes(role))) return { kind: "all" };
  if (roles.some((role) => CLINIC_SCOPED_ROLES.includes(role))) return { kind: "clinics" };
  if (roles.some((role) => OWN_COLLABORATOR_ROLES.includes(role))) return { kind: "own-collaborator" };
  return { kind: "own-collaborator" };
}
