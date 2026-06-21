import type { RequestHandler } from "express";

import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import type { AuthService } from "./auth.service.js";
import { loginSchema } from "./auth.validation.js";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  readonly login: RequestHandler = async (request, response) => {
    const input = parseWithSchema(loginSchema, request.body);
    const result = await this.service.login(input);
    sendSuccess(response, result);
  };
}
