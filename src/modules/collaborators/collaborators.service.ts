import type { AuthenticatedRequestContext } from "../../types/global.js";
import { CollaboratorsRepository } from "./collaborators.repository.js";
import type { ListCollaboratorsInput } from "./collaborators.validation.js";

export class CollaboratorsService {
  constructor(private readonly repository = new CollaboratorsRepository()) {}

  list(context: AuthenticatedRequestContext, input: ListCollaboratorsInput) {
    return this.repository.list(context.tenantId, context.userId, input);
  }

  get(context: AuthenticatedRequestContext, collaboratorId: string) {
    return this.repository.findById(context.tenantId, context.userId, collaboratorId);
  }
}
