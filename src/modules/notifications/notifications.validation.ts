import { z } from "zod";

const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID"
);

export const NOTIFICATION_TYPES = [
  "appointment_reminder",
  "pending_note",
  "unregistered_attendance",
  "appointment_change",
  "handoff_note_received",
  "administrative_alert"
] as const;

export const notificationIdParamsSchema = z.object({ notificationId: postgresUuid });

export const listNotificationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["unread", "read"]).optional()
});

export const createNotificationSchema = z.object({
  userId: postgresUuid,
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string().trim().min(1).max(150),
  message: z.string().trim().min(1),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export type ListNotificationsInput = z.output<typeof listNotificationsSchema>;
export type CreateNotificationInput = z.output<typeof createNotificationSchema>;
