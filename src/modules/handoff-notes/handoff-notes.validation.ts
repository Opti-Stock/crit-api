import { z } from "zod";

const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID"
);

export const handoffNoteIdParamsSchema = z.object({ handoffNoteId: postgresUuid });

export const listHandoffNotesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["pending", "read", "archived"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional()
});

export const createHandoffNoteSchema = z.object({
  patientId: postgresUuid,
  appointmentId: postgresUuid.optional(),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  recipientUserIds: z.array(postgresUuid).min(1)
});

export type ListHandoffNotesInput = z.output<typeof listHandoffNotesSchema>;
export type CreateHandoffNoteInput = z.output<typeof createHandoffNoteSchema>;
