import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.email().max(255)),
  password: z.string().min(1).max(255)
}).strict();

export type LoginInput = z.output<typeof loginSchema>;
