import { z } from "zod";

const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID"
);

const REGISTERED_STATUSES = ["present", "absent", "late", "cancelled", "rescheduled"] as const;
const ATTENDANCE_STATUSES = ["pending", ...REGISTERED_STATUSES] as const;

export const attendanceIdParamsSchema = z.object({ attendanceId: postgresUuid });

export const listAttendanceSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  status: z.enum(ATTENDANCE_STATUSES).optional(),
  clinicId: postgresUuid.optional(),
  patientId: postgresUuid.optional(),
  collaboratorId: postgresUuid.optional()
});

export const createAttendanceSchema = z.object({
  appointmentId: postgresUuid,
  status: z.enum(REGISTERED_STATUSES),
  notesRequired: z.boolean().default(false)
});

export type ListAttendanceInput = z.output<typeof listAttendanceSchema>;
export type CreateAttendanceInput = z.output<typeof createAttendanceSchema>;
