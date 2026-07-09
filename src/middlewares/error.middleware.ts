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
    ...serializeUnhandledError(error),
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

function serializeUnhandledError(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      name: "UnknownError",
      message: String(error)
    };
  }

  const errorWithCode = error as Error & {
    code?: string;
    cause?: unknown;
    errors?: unknown[];
  };

  return {
    name: error.name,
    message: error.message,
    code: errorWithCode.code,
    cause: serializeNestedError(errorWithCode.cause),
    errors: Array.isArray(errorWithCode.errors)
      ? errorWithCode.errors.map(serializeNestedError)
      : undefined
  };
}

function serializeNestedError(error: unknown) {
  if (!(error instanceof Error)) {
    return error === undefined ? undefined : String(error);
  }

  const nested = error as Error & { code?: string };
  return {
    name: nested.name,
    message: nested.message,
    code: nested.code
  };
}
