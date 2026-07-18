import type { ErrorRequestHandler } from "express";

import { AppError } from "../shared/errors/app-error.js";
import { sendError } from "../shared/responses/api-response.js";

export const errorMiddleware: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  _next
) => {
  if (error instanceof AppError) {
    sendError(
      response,
      error.statusCode,
      error.code,
      error.message,
      error.details
    );
    return;
  }

  console.error("Unhandled request error", {
    name: error instanceof Error ? error.name : "UnknownError",
    code: readSafeErrorCode(error),
    requestId: request.requestId,
    method: request.method,
    path: request.path
  });

  sendError(
    response,
    500,
    "INTERNAL_SERVER_ERROR",
    "An unexpected error occurred"
  );
};

function readSafeErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === "string" && /^[A-Z0-9_]{1,64}$/.test(code) ? code : undefined;
}
