import type { AuthenticatedRequestContext } from "../../types/global.js";
import { RolesRepository } from "./roles.repository.js";

export class RolesService {
  constructor(private readonly repository = new RolesRepository()) {}

  list(context: AuthenticatedRequestContext) {
    return this.repository.list(context.tenantId, context.userId);
  }
}
