import { z } from "zod";

const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID"
);

const optionalString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

export const checkinAppointmentIdParamsSchema = z.object({ appointmentId: postgresUuid });

export const listCheckinAppointmentsSchema = z.object({
  date: optionalString(z.iso.date()),
  clinicId: optionalString(postgresUuid),
  search: optionalString(z.string().trim().max(255)),
  status: optionalString(z.enum(["scheduled", "cancelled", "rescheduled"])),
  checkInStatus: optionalString(z.enum(["checked_in", "not_checked_in"]))
});

export const checkInAppointmentSchema = z.object({}).strict();
export const scanCheckinSchema = z.object({
  code: z.string().trim().min(1).max(255),
  date: optionalString(z.iso.date())
}).strict();

export type ListCheckinAppointmentsInput = z.output<typeof listCheckinAppointmentsSchema>;
export type CheckInAppointmentInput = z.output<typeof checkInAppointmentSchema>;
export type ScanCheckinInput = z.output<typeof scanCheckinSchema>;
