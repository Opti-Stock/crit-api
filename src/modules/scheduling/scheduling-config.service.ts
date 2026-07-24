import type { AuthenticatedRequestContext } from "../../types/global.js";
import { resolveOperationalAccessScope } from "../../shared/access/operational-access-scope.js";
import { BadRequestError } from "../../shared/errors/app-error.js";
import { SchedulingConfigRepository } from "./scheduling-config.repository.js";
import type {
  AppointmentTypeAssignmentsInput,
  CreateSchedulingBlockInput,
  OperatingHoursInput,
  PatientPreferencesInput,
  SchedulingBlocksQuery
} from "./scheduling-config.validation.js";

export class SchedulingConfigService {
  constructor(private readonly repository = new SchedulingConfigRepository()) {}

  listOperatingHours(context: AuthenticatedRequestContext, clinicId: string) {
    return this.repository.listOperatingHours(this.context(context, clinicId));
  }

  replaceOperatingHours(
    context: AuthenticatedRequestContext,
    clinicId: string,
    input: OperatingHoursInput
  ) {
    assertNoOverlaps(input.hours);
    return this.repository.replaceOperatingHours(
      this.context(context, clinicId),
      input
    );
  }

  listClinicAppointmentTypes(
    context: AuthenticatedRequestContext,
    clinicId: string
  ) {
    return this.repository.listClinicAppointmentTypes(
      this.context(context, clinicId)
    );
  }

  replaceClinicAppointmentTypes(
    context: AuthenticatedRequestContext,
    clinicId: string,
    input: AppointmentTypeAssignmentsInput
  ) {
    assertNoDuplicateIds(input.appointmentTypeIds);
    return this.repository.replaceClinicAppointmentTypes(
      this.context(context, clinicId),
      input
    );
  }

  listCollaboratorAppointmentTypes(
    context: AuthenticatedRequestContext,
    clinicId: string,
    collaboratorId: string
  ) {
    return this.repository.listCollaboratorAppointmentTypes(
      this.context(context, clinicId),
      collaboratorId
    );
  }

  replaceCollaboratorAppointmentTypes(
    context: AuthenticatedRequestContext,
    clinicId: string,
    collaboratorId: string,
    input: AppointmentTypeAssignmentsInput
  ) {
    assertNoDuplicateIds(input.appointmentTypeIds);
    return this.repository.replaceCollaboratorAppointmentTypes(
      this.context(context, clinicId),
      collaboratorId,
      input
    );
  }

  listRoomAppointmentTypes(
    context: AuthenticatedRequestContext,
    clinicId: string,
    roomId: string
  ) {
    return this.repository.listRoomAppointmentTypes(
      this.context(context, clinicId),
      roomId
    );
  }

  replaceRoomAppointmentTypes(
    context: AuthenticatedRequestContext,
    clinicId: string,
    roomId: string,
    input: AppointmentTypeAssignmentsInput
  ) {
    assertNoDuplicateIds(input.appointmentTypeIds);
    return this.repository.replaceRoomAppointmentTypes(
      this.context(context, clinicId),
      roomId,
      input
    );
  }

  listBlocks(
    context: AuthenticatedRequestContext,
    clinicId: string,
    query: SchedulingBlocksQuery
  ) {
    return this.repository.listBlocks(this.context(context, clinicId), query);
  }

  createBlock(
    context: AuthenticatedRequestContext,
    clinicId: string,
    input: CreateSchedulingBlockInput
  ) {
    return this.repository.createBlock(this.context(context, clinicId), input);
  }

  deleteBlock(
    context: AuthenticatedRequestContext,
    clinicId: string,
    blockId: string
  ) {
    return this.repository.deleteBlock(
      this.context(context, clinicId),
      blockId
    );
  }

  listPatientPreferences(
    context: AuthenticatedRequestContext,
    clinicId: string,
    patientId: string
  ) {
    return this.repository.listPatientPreferences(
      this.context(context, clinicId),
      patientId
    );
  }

  replacePatientPreferences(
    context: AuthenticatedRequestContext,
    clinicId: string,
    patientId: string,
    input: PatientPreferencesInput
  ) {
    assertNoOverlaps(input.preferences);
    return this.repository.replacePatientPreferences(
      this.context(context, clinicId),
      patientId,
      input
    );
  }

  private context(context: AuthenticatedRequestContext, clinicId: string) {
    return {
      tenantId: context.tenantId,
      userId: context.userId,
      clinicId,
      scope: resolveOperationalAccessScope(context.roles)
    };
  }
}

interface TimeRange {
  weekday: number;
  startTime: string;
  endTime: string;
}

export function assertNoOverlaps(ranges: readonly TimeRange[]) {
  const sorted = [...ranges].sort(
    (left, right) => left.weekday - right.weekday
      || left.startTime.localeCompare(right.startTime)
      || left.endTime.localeCompare(right.endTime)
  );
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index]!;
    if (current.startTime >= current.endTime) {
      throw new BadRequestError(
        "Each time range must start before it ends",
        "SCHEDULING_TIME_RANGE_INVALID"
      );
    }
    const previous = sorted[index - 1];
    if (
      previous
      && previous.weekday === current.weekday
      && previous.endTime > current.startTime
    ) {
      throw new BadRequestError(
        "Time ranges cannot overlap on the same weekday",
        "SCHEDULING_TIME_RANGE_OVERLAP"
      );
    }
  }
}

function assertNoDuplicateIds(ids: readonly string[]) {
  if (new Set(ids).size !== ids.length) {
    throw new BadRequestError(
      "Appointment type assignments cannot contain duplicates",
      "SCHEDULING_ASSIGNMENT_DUPLICATE"
    );
  }
}
