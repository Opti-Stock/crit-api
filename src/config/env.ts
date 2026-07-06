import "dotenv/config";
import { z } from "zod";

const portSchema = z.coerce.number().int().min(1).max(65_535);
const positiveIntegerSchema = z.coerce.number().int().positive();

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    MAIN_API_PORT: portSchema.default(3000),
    ADMIN_API_PORT: portSchema.default(3001),
    CHECKIN_API_PORT: portSchema.default(3002),
    SUPER_ADMIN_API_PORT: portSchema.default(3003),
    DATABASE_URL: z
      .string()
      .min(1)
      .refine(
        (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
        "DATABASE_URL must be a PostgreSQL connection URL"
      ),
    PLATFORM_DATABASE_URL: z
      .string()
      .min(1)
      .refine(
        (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
        "PLATFORM_DATABASE_URL must be a PostgreSQL connection URL"
      ),
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().min(1).default("8h"),
    JWT_ISSUER: z.string().min(1).default("crit-api"),
    JWT_AUDIENCE: z.string().min(1).default("crit-assist"),
    PLATFORM_JWT_SECRET: z.string().min(32),
    PLATFORM_JWT_EXPIRES_IN: z.string().min(1).default("4h"),
    PLATFORM_JWT_ISSUER: z.string().min(1).default("crit-api-platform"),
    PLATFORM_JWT_AUDIENCE: z.string().min(1).default("crit-assist-platform"),
    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    PLATFORM_BOOTSTRAP_FULL_NAME: z.string().min(1).default("Platform Super Admin"),
    PLATFORM_BOOTSTRAP_EMAIL: z.union([
      z.literal(""),
      z.string().transform((value) => value.trim().toLowerCase()).pipe(z.email())
    ]).default(""),
    PLATFORM_BOOTSTRAP_PASSWORD: z.union([z.literal(""), z.string().min(12).max(72)]).default(""),
    CORS_ORIGIN: z.url(),
    CRIT_POST_API_URL: z.union([z.literal(""), z.url()]).default(""),
    CRIT_POST_API_TOKEN: z.string().default(""),
    CRIT_POST_API_POLL_INTERVAL_MS: positiveIntegerSchema.default(5_000),
    CRIT_POST_API_BATCH_SIZE: positiveIntegerSchema.max(100).default(10),
    CRIT_POST_API_MAX_RETRIES: positiveIntegerSchema.default(5),
    CRIT_POST_API_REQUEST_TIMEOUT_MS: positiveIntegerSchema.default(10_000),
    CRIT_POST_API_PROCESSING_TIMEOUT_MS: positiveIntegerSchema.default(60_000)
  })
  .superRefine((values, context) => {
    if (
      values.NODE_ENV === "production" &&
      values.JWT_SECRET === "replace_with_at_least_32_characters"
    ) {
      context.addIssue({
        code: "custom",
        path: ["JWT_SECRET"],
        message: "JWT_SECRET must be configured in production"
      });
    }
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = parsedEnv.data;
export type Env = z.infer<typeof envSchema>;
