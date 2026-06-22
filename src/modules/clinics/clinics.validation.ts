import { z } from "zod";

import { CLINIC_STATUSES } from "./clinics.constants.js";

const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID"
);

export const clinicIdParamsSchema = z.object({ clinicId: postgresUuid });

export const listClinicsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional(),
  status: z.enum(CLINIC_STATUSES).optional()
});

export type ListClinicsInput = z.output<typeof listClinicsSchema>;
