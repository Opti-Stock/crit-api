import { z } from "zod";

const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID"
);

const email = z.string().transform((value) => value.trim().toLowerCase()).pipe(z.email().max(255));

export const platformLoginSchema = z.object({
  email,
  password: z.string().min(1).max(255)
}).strict();

export const tenantIdParamsSchema = z.object({ tenantId: postgresUuid });

export const createTenantSchema = z.object({
  code: z.string().trim().min(1).max(100).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(255),
  state: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional()
}).strict();

export const updateTenantSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    state: z.string().trim().max(100).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    status: z.enum(["active", "inactive"]).optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const createTenantAdminSchema = z.object({
  fullName: z.string().trim().min(1).max(255),
  email,
  password: z.string().min(12).max(72)
}).strict();

export type PlatformLoginInput = z.output<typeof platformLoginSchema>;
export type CreateTenantInput = z.output<typeof createTenantSchema>;
export type UpdateTenantInput = z.output<typeof updateTenantSchema>;
export type CreateTenantAdminInput = z.output<typeof createTenantAdminSchema>;
