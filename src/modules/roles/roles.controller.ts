import type { RequestHandler } from "express";

import { sendSuccess } from "../../shared/responses/api-response.js";
import { RolesService } from "./roles.service.js";

export class RolesController {
  constructor(private readonly service = new RolesService()) {}

  readonly list: RequestHandler = async (request, response) => {
    const roles = await this.service.list(request.auth!);
    sendSuccess(response, roles);
  };
}
