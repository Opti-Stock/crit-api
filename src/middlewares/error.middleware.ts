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
