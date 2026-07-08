import type { RequestHandler } from "express";

import { NotFoundError } from "../../shared/errors/app-error.js";
import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { UsersService } from "./users.service.js";
import {
  createUserSchema,
  adminReasonSchema,
  listUsersSchema,
  replaceClinicAccessSchema,
  replaceRolesSchema,
  updatePasswordSchema,
  updateUserSchema,
  userIdParamsSchema
} from "./users.validation.js";

export class UsersController {
  constructor(private readonly service = new UsersService()) {}

  readonly list: RequestHandler = async (request, response) => {
    const input = parseWithSchema(listUsersSchema, request.query);
    const result = await this.service.list(request.auth!, input);
    sendSuccess(response, result.users, 200, {
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize)
    });
  };

  readonly get: RequestHandler = async (request, response) => {
    const { userId } = parseWithSchema(userIdParamsSchema, request.params);
    const user = await this.service.get(request.auth!, userId);
    if (!user) throw new NotFoundError("User not found", "USER_NOT_FOUND");
    sendSuccess(response, user);
  };

  readonly create: RequestHandler = async (request, response) => {
    const input = parseWithSchema(createUserSchema, request.body);
    sendSuccess(response, await this.service.create(request.auth!, input), 201);
  };

  readonly update: RequestHandler = async (request, response) => {
    const { userId } = parseWithSchema(userIdParamsSchema, request.params);
    const input = parseWithSchema(updateUserSchema, request.body);
    sendSuccess(response, await this.service.update(request.auth!, userId, input));
  };

  readonly delete: RequestHandler = async (request, response) => {
    const { userId } = parseWithSchema(userIdParamsSchema, request.params);
    const input = parseWithSchema(adminReasonSchema, request.body ?? {});
    await this.service.delete(request.auth!, userId, input);
    response.status(204).send();
  };

  readonly restore: RequestHandler = async (request, response) => {
    const { userId } = parseWithSchema(userIdParamsSchema, request.params);
    const input = parseWithSchema(adminReasonSchema, request.body ?? {});
    sendSuccess(response, await this.service.restore(request.auth!, userId, input));
  };

  readonly replaceRoles: RequestHandler = async (request, response) => {
    const { userId } = parseWithSchema(userIdParamsSchema, request.params);
    const { roleIds } = parseWithSchema(replaceRolesSchema, request.body);
    sendSuccess(response, await this.service.replaceRoles(request.auth!, userId, roleIds));
  };

  readonly replaceClinicAccess: RequestHandler = async (request, response) => {
    const { userId } = parseWithSchema(userIdParamsSchema, request.params);
    const { clinicAccess } = parseWithSchema(replaceClinicAccessSchema, request.body);
    sendSuccess(response, await this.service.replaceClinicAccess(request.auth!, userId, clinicAccess));
  };

  readonly updatePassword: RequestHandler = async (request, response) => {
    const { userId } = parseWithSchema(userIdParamsSchema, request.params);
    const { password } = parseWithSchema(updatePasswordSchema, request.body);
    await this.service.updatePassword(request.auth!, userId, password);
    response.status(204).send();
  };
}
