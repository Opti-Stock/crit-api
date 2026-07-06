import type { RequestHandler } from "express";

import { NotFoundError } from "../../shared/errors/app-error.js";
import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { PlatformService } from "./platform.service.js";
import {
  createTenantAdminSchema,
  createTenantSchema,
  platformLoginSchema,
  tenantIdParamsSchema,
  updateTenantSchema
} from "./platform.validation.js";

export class PlatformController {
  constructor(private readonly service = new PlatformService()) {}

  readonly login: RequestHandler = async (request, response) => {
    const input = parseWithSchema(platformLoginSchema, request.body);
    sendSuccess(response, await this.service.login(input));
  };

  readonly me: RequestHandler = async (request, response) => {
    sendSuccess(response, this.service.me(request.platformAuth!));
  };

  readonly listTenants: RequestHandler = async (_request, response) => {
    sendSuccess(response, await this.service.listTenants());
  };

  readonly getTenant: RequestHandler = async (request, response) => {
    const { tenantId } = parseWithSchema(tenantIdParamsSchema, request.params);
    const tenant = await this.service.getTenant(request.platformAuth!, tenantId);
    if (!tenant) throw new NotFoundError("Tenant not found", "TENANT_NOT_FOUND");
    sendSuccess(response, tenant);
  };

  readonly createTenant: RequestHandler = async (request, response) => {
    const input = parseWithSchema(createTenantSchema, request.body);
    sendSuccess(response, await this.service.createTenant(request.platformAuth!, input), 201);
  };

  readonly updateTenant: RequestHandler = async (request, response) => {
    const { tenantId } = parseWithSchema(tenantIdParamsSchema, request.params);
    const input = parseWithSchema(updateTenantSchema, request.body);
    sendSuccess(response, await this.service.updateTenant(request.platformAuth!, tenantId, input));
  };

  readonly createFirstTenantAdmin: RequestHandler = async (request, response) => {
    const { tenantId } = parseWithSchema(tenantIdParamsSchema, request.params);
    const input = parseWithSchema(createTenantAdminSchema, request.body);
    sendSuccess(response, await this.service.createFirstTenantAdmin(request.platformAuth!, tenantId, input), 201);
  };
}
