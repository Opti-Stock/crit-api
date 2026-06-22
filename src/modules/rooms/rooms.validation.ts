import { z } from "zod";

const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID"
);

export const roomIdParamsSchema = z.object({ roomId: postgresUuid });

export const listRoomsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  clinicId: postgresUuid.optional()
});

export type ListRoomsInput = z.output<typeof listRoomsSchema>;
