import { z } from "zod";

const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID"
);

export const checkinAppointmentIdParamsSchema = z.object({ appointmentId: postgresUuid });

export const listCheckinAppointmentsSchema = z.object({
  date: z.iso.date().optional(),
  clinicId: postgresUuid.optional(),
  search: z.string().trim().max(255).optional(),
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "rescheduled"]).optional()
});

export const checkInAppointmentSchema = z.object({
  status: z.enum(["present", "late"]).default("present")
}).strict();

export type ListCheckinAppointmentsInput = z.output<typeof listCheckinAppointmentsSchema>;
export type CheckInAppointmentInput = z.output<typeof checkInAppointmentSchema>;
