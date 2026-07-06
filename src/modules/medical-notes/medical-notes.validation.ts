import { z } from "zod";

const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID"
);

const noteContent = z.record(z.string(), z.unknown());

export const medicalNoteIdParamsSchema = z.object({ medicalNoteId: postgresUuid });

export const listMedicalNotesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  patientId: postgresUuid.optional(),
  collaboratorId: postgresUuid.optional()
});

export const createMedicalNoteSchema = z.object({
  appointmentId: postgresUuid,
  content: noteContent,
  formatVersion: z.string().trim().min(1).max(50).default("1.0")
});

export const updateMedicalNoteSchema = z.object({
  content: noteContent.optional(),
  formatVersion: z.string().trim().min(1).max(50).optional()
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type ListMedicalNotesInput = z.output<typeof listMedicalNotesSchema>;
export type CreateMedicalNoteInput = z.output<typeof createMedicalNoteSchema>;
export type UpdateMedicalNoteInput = z.output<typeof updateMedicalNoteSchema>;
