import type { ApiErrorDetail } from "../responses/api-response.js";

interface AppErrorOptions {
  statusCode: number;
  code: string;
  message: string;
  details?: readonly ApiErrorDetail[];
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: readonly ApiErrorDetail[];

  constructor({ statusCode, code, message, details }: AppErrorOptions) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(
    message = "Bad request",
    code = "BAD_REQUEST",
    details?: readonly ApiErrorDetail[]
  ) {
    super({ statusCode: 400, code, message, details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", code = "UNAUTHORIZED") {
    super({ statusCode: 401, code, message });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", code = "FORBIDDEN") {
    super({ statusCode: 403, code, message });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", code = "NOT_FOUND") {
    super({ statusCode: 404, code, message });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", code = "CONFLICT") {
    super({ statusCode: 409, code, message });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service unavailable", code = "SERVICE_UNAVAILABLE") {
    super({ statusCode: 503, code, message });
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests", code = "TOO_MANY_REQUESTS") {
    super({ statusCode: 429, code, message });
  }
}
