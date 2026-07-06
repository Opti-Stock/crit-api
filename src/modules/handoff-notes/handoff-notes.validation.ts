import { z } from "zod";

const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID"
);

const optionalString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

export const handoffNoteIdParamsSchema = z.object({ handoffNoteId: postgresUuid });

export const listHandoffNotesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: optionalString(z.enum(["pending", "read", "archived"])),
  priority: optionalString(z.enum(["low", "medium", "high", "urgent"]))
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
