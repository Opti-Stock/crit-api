import { z } from "zod";

const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID"
);
const email = z.string().transform((value) => value.trim().toLowerCase()).pipe(z.email().max(255));
const clinicAccess = z.object({
  clinicId: postgresUuid,
  accessLevel: z.enum(["standard", "manage"])
});

export const userIdParamsSchema = z.object({ userId: postgresUuid });
export const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  includeDeleted: z.coerce.boolean().default(false)
});
export const createUserSchema = z.object({
  fullName: z.string().trim().min(1).max(255),
  email,
  password: z.string().min(12).max(72),
  roleIds: z.array(postgresUuid).min(1),
  clinicAccess: z.array(clinicAccess).default([]),
  specialty: z.string().trim().max(150).optional(),
  position: z.string().trim().max(100).optional()
});
export const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(1).max(255).optional(),
    email: email.optional(),
    status: z.enum(["active", "inactive"]).optional()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");
export const replaceRolesSchema = z.object({ roleIds: z.array(postgresUuid).min(1) });
export const replaceClinicAccessSchema = z.object({ clinicAccess: z.array(clinicAccess) });
export const updatePasswordSchema = z.object({ password: z.string().min(12).max(72) });

export type ListUsersInput = z.output<typeof listUsersSchema>;
export type CreateUserInput = z.output<typeof createUserSchema>;
export type UpdateUserInput = z.output<typeof updateUserSchema>;
export type ClinicAccessInput = z.output<typeof clinicAccess>;
