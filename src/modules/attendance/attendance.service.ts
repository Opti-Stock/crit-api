import type { AuthenticatedRequestContext } from "../../types/global.js";
import { AttendanceRepository, type AttendanceAccessScope } from "./attendance.repository.js";
import type { CreateAttendanceInput, ListAttendanceInput } from "./attendance.validation.js";

const TENANT_WIDE_ROLES = ["admin", "direccion"];
const CLINIC_SCOPED_ROLES = ["recepcion", "coordinador"];
const OWN_COLLABORATOR_ROLES = ["medico", "terapeuta"];

export class AttendanceService {
  constructor(private readonly repository = new AttendanceRepository()) {}

  list(context: AuthenticatedRequestContext, input: ListAttendanceInput) {
    return this.repository.list(context.tenantId, context.userId, input, resolveScope(context.roles));
  }

  get(context: AuthenticatedRequestContext, attendanceId: string) {
    return this.repository.findById(context.tenantId, context.userId, attendanceId);
  }

  create(context: AuthenticatedRequestContext, input: CreateAttendanceInput) {
    return this.repository.create(context.tenantId, context.userId, context.roles, input);
  }
}

export function resolveScope(roles: string[]): AttendanceAccessScope {
  if (roles.some((role) => TENANT_WIDE_ROLES.includes(role))) return { kind: "all" };
  if (roles.some((role) => CLINIC_SCOPED_ROLES.includes(role))) return { kind: "clinics" };
  if (roles.some((role) => OWN_COLLABORATOR_ROLES.includes(role))) return { kind: "own-collaborator" };
  return { kind: "own-collaborator" };
}
