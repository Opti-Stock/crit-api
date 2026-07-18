import type { RequestHandler } from "express";

import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import type { AuthService } from "./auth.service.js";
import { loginSchema } from "./auth.validation.js";
import { clearSessionCookie, SESSION_COOKIE, setSessionCookie } from "../../config/cookies.js";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  readonly login: RequestHandler = async (request, response) => {
    const input = parseWithSchema(loginSchema, request.body);
    const result = await this.service.login(input);
    setSessionCookie(response, SESSION_COOKIE, result.accessToken);
    const { accessToken: _accessToken, tokenType: _tokenType, ...publicSession } = result;
    sendSuccess(response, publicSession);
  };

  readonly logout: RequestHandler = (_request, response) => {
    clearSessionCookie(response, SESSION_COOKIE);
    response.status(204).send();
  };

  readonly me: RequestHandler = (request, response) => {
    sendSuccess(response, request.auth);
  };
}
