import type { AuthenticatedRequestContext } from "../../types/global.js";
import { resolveOperationalAccessScope } from "../../shared/access/operational-access-scope.js";
import { AttendanceRepository } from "./attendance.repository.js";
import type { CreateAttendanceInput, ListAttendanceInput } from "./attendance.validation.js";

export class AttendanceService {
  constructor(private readonly repository = new AttendanceRepository()) {}

  list(context: AuthenticatedRequestContext, input: ListAttendanceInput) {
    return this.repository.list(
      context.tenantId,
      context.userId,
      input,
      resolveOperationalAccessScope(context.roles)
    );
  }

  get(context: AuthenticatedRequestContext, attendanceId: string) {
    return this.repository.findById(
      context.tenantId,
      context.userId,
      attendanceId,
      resolveOperationalAccessScope(context.roles)
    );
  }

  create(context: AuthenticatedRequestContext, input: CreateAttendanceInput) {
    return this.repository.create(context.tenantId, context.userId, context.roles, input);
  }
}

export const resolveScope = resolveOperationalAccessScope;
