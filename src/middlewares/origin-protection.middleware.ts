import type { RequestHandler } from "express";

import { env } from "../config/env.js";
import { ForbiddenError } from "../shared/errors/app-error.js";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const allowedOrigins = new Set(env.CORS_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean));

export const requireTrustedOrigin: RequestHandler = (request, _response, next) => {
  if (safeMethods.has(request.method) || !request.header("cookie")) {
    next();
    return;
  }

  const origin = request.header("origin");
  if (origin && allowedOrigins.has(origin)) {
    next();
    return;
  }

  next(new ForbiddenError("Request origin is not allowed", "UNTRUSTED_ORIGIN"));
};
