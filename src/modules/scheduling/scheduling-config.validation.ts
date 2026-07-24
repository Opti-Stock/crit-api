import { z } from "zod";

const postgresUuid = z.string().uuid();
const localTime = z.string().regex(
  /^([01]\d|2[0-3]):[0-5]\d$/,
  "Time must use HH:mm format"
);

export const clinicSchedulingParamsSchema = z.object({
  clinicId: postgresUuid
}).strict();

export const collaboratorSchedulingParamsSchema = z.object({
  clinicId: postgresUuid,
  collaboratorId: postgresUuid
}).strict();

export const roomSchedulingParamsSchema = z.object({
  clinicId: postgresUuid,
  roomId: postgresUuid
}).strict();

export const patientSchedulingParamsSchema = z.object({
  clinicId: postgresUuid,
  patientId: postgresUuid
}).strict();

export const schedulingBlockParamsSchema = z.object({
  clinicId: postgresUuid,
  blockId: postgresUuid
}).strict();

export const operatingHoursSchema = z.object({
  hours: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    startTime: localTime,
    endTime: localTime
  }).strict()).max(50)
}).strict();

export const appointmentTypeAssignmentsSchema = z.object({
  appointmentTypeIds: z.array(postgresUuid).max(100)
}).strict();

export const schedulingBlocksQuerySchema = z.object({
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime().optional()
}).strict().refine(
  (input) => !input.startsAt || !input.endsAt
    || Date.parse(input.startsAt) < Date.parse(input.endsAt),
  { message: "startsAt must be earlier than endsAt", path: ["startsAt"] }
);

export const createSchedulingBlockSchema = z.object({
  collaboratorId: postgresUuid.optional(),
  roomId: postgresUuid.optional(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  reason: z.string().trim().min(1).max(255)
}).strict().superRefine((input, context) => {
  if (input.collaboratorId && input.roomId) {
    context.addIssue({
      code: "custom",
      message: "A block can target a collaborator or a room, not both",
      path: ["roomId"]
    });
  }
  if (Date.parse(input.startsAt) >= Date.parse(input.endsAt)) {
    context.addIssue({
      code: "custom",
      message: "startsAt must be earlier than endsAt",
      path: ["startsAt"]
    });
  }
});

export const patientPreferencesSchema = z.object({
  preferences: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    startTime: localTime,
    endTime: localTime
  }).strict()).max(50)
}).strict();

export type OperatingHoursInput = z.output<typeof operatingHoursSchema>;
export type AppointmentTypeAssignmentsInput = z.output<
  typeof appointmentTypeAssignmentsSchema
>;
export type SchedulingBlocksQuery = z.output<typeof schedulingBlocksQuerySchema>;
export type CreateSchedulingBlockInput = z.output<
  typeof createSchedulingBlockSchema
>;
export type PatientPreferencesInput = z.output<typeof patientPreferencesSchema>;
