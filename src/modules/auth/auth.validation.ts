import { z } from "zod";

export const loginSchema = z.object({
  tenantCode: z.string().trim().min(1).max(100).transform((value) => value.toUpperCase()),
  email: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.email().max(255)),
  password: z.string().min(1).max(255)
});

export type LoginInput = z.output<typeof loginSchema>;
