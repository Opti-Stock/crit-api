import { z } from "zod";

const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID"
);

const optionalString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const APPOINTMENT_STATUSES = ["scheduled", "cancelled", "rescheduled"] as const;

export const appointmentIdParamsSchema = z.object({ appointmentId: postgresUuid });

export const listAppointmentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  from: optionalString(z.iso.datetime()),
  to: optionalString(z.iso.datetime()),
  status: optionalString(z.enum(APPOINTMENT_STATUSES)),
  clinicId: optionalString(postgresUuid),
  patientId: optionalString(postgresUuid),
  collaboratorId: optionalString(postgresUuid)
});

export const createAppointmentSchema = z
  .object({
    patientId: postgresUuid,
    collaboratorId: postgresUuid,
    clinicId: postgresUuid,
    roomId: postgresUuid,
    appointmentTypeId: postgresUuid,
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    preSessionMinutes: z.coerce.number().int().min(0).default(0),
    postSessionMinutes: z.coerce.number().int().min(0).default(0)
  })
  .refine((value) => new Date(value.startsAt).getTime() < new Date(value.endsAt).getTime(), {
    message: "startsAt must be before endsAt",
    path: ["endsAt"]
  });

export const updateAppointmentSchema = z
  .object({
    patientId: postgresUuid.optional(),
    collaboratorId: postgresUuid.optional(),
    clinicId: postgresUuid.optional(),
    roomId: postgresUuid.optional(),
    appointmentTypeId: postgresUuid.optional(),
    startsAt: z.iso.datetime().optional(),
    endsAt: z.iso.datetime().optional(),
    preSessionMinutes: z.coerce.number().int().min(0).optional(),
    postSessionMinutes: z.coerce.number().int().min(0).optional(),
    status: z.enum(APPOINTMENT_STATUSES).optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required")
  .refine(
    (value) =>
      !value.startsAt ||
      !value.endsAt ||
      new Date(value.startsAt).getTime() < new Date(value.endsAt).getTime(),
    {
      message: "startsAt must be before endsAt",
      path: ["endsAt"]
    }
  );

export type ListAppointmentsInput = z.output<typeof listAppointmentsSchema>;
export type CreateAppointmentInput = z.output<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.output<typeof updateAppointmentSchema>;
