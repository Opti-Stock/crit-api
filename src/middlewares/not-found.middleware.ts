import type { RequestHandler } from "express";

import { NotFoundError } from "../shared/errors/app-error.js";

export const notFoundMiddleware: RequestHandler = (_request, _response, next) => {
  next(new NotFoundError());
};
