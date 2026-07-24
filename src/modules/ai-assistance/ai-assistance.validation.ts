import { z } from "zod";

const uuid = z.string().uuid();
export const noteKindSchema = z.enum(["medical", "handoff"]);

export const patientAiParamsSchema = z.object({ patientId: uuid });
export const summaryParamsSchema = z.object({ summaryId: uuid });
export const interactionParamsSchema = z.object({ interactionId: uuid });
export const createSummarySchema = z.object({ kind: noteKindSchema }).strict();
export const latestSummaryQuerySchema = z.object({ kind: noteKindSchema });
export const createQuestionSchema = z.object({
  kind: noteKindSchema,
  question: z.string().trim().min(1).max(500)
}).strict();
export const listInteractionsQuerySchema = z.object({
  kind: noteKindSchema,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20)
});
export const feedbackSchema = z.object({
  rating: z.enum(["helpful", "not_helpful"]),
  reason: z.enum(["incorrect", "incomplete", "irrelevant", "missing_source"]).optional()
}).strict().superRefine((value, context) => {
  if (value.rating === "helpful" && value.reason) {
    context.addIssue({
      code: "custom",
      path: ["reason"],
      message: "A reason is only accepted for not_helpful feedback"
    });
  }
});

export type NoteKind = z.output<typeof noteKindSchema>;
export type CreateQuestionInput = z.output<typeof createQuestionSchema>;
export type ListInteractionsInput = z.output<typeof listInteractionsQuerySchema>;
export type FeedbackInput = z.output<typeof feedbackSchema>;
