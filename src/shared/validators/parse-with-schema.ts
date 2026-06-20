import type { z } from "zod";

import { BadRequestError } from "../errors/app-error.js";

export function parseWithSchema<TSchema extends z.ZodType>(
  schema: TSchema,
  data: unknown
): z.output<TSchema> {
  const result = schema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  const details = result.error.issues.map((issue) => ({
    path: issue.path.map(String).join(".") || "$",
    message: issue.message
  }));

  throw new BadRequestError(
    "Request validation failed",
    "VALIDATION_ERROR",
    details
  );
}
