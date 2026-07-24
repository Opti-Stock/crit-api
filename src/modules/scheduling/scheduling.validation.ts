import { z } from "zod";

import {
  DEFAULT_RECOMMENDATION_LIMIT,
  MAX_RECOMMENDATION_LIMIT
} from "./scheduling.constants.js";

const postgresUuid = z.string().uuid();

export const appointmentRecommendationsSchema = z.object({
  patientId: postgresUuid,
  clinicId: postgresUuid,
  localDate: z.iso.date().optional(),
  collaboratorId: postgresUuid.optional(),
  appointmentTypeId: postgresUuid.optional(),
  roomId: postgresUuid.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_RECOMMENDATION_LIMIT)
    .default(DEFAULT_RECOMMENDATION_LIMIT)
}).strict();

export type AppointmentRecommendationsInput = z.output<
  typeof appointmentRecommendationsSchema
>;
