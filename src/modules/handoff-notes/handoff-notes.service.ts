import type { AuthenticatedRequestContext } from "../../types/global.js";
import { resolveOperationalAccessScope } from "../../shared/access/operational-access-scope.js";
import { HandoffNotesRepository } from "./handoff-notes.repository.js";
import type { CreateHandoffNoteInput, ListHandoffNotesInput } from "./handoff-notes.validation.js";

export class HandoffNotesService {
  constructor(private readonly repository = new HandoffNotesRepository()) {}

  list(context: AuthenticatedRequestContext, input: ListHandoffNotesInput) {
    return this.repository.list(
      context.tenantId,
      context.userId,
      context.roles,
      input,
      resolveOperationalAccessScope(context.roles)
    );
  }

  get(context: AuthenticatedRequestContext, handoffNoteId: string) {
    return this.repository.findById(
      context.tenantId,
      context.userId,
      context.roles,
      handoffNoteId,
      resolveOperationalAccessScope(context.roles)
    );
  }

  create(context: AuthenticatedRequestContext, input: CreateHandoffNoteInput) {
    return this.repository.create(context.tenantId, context.userId, input);
  }

  markAsRead(context: AuthenticatedRequestContext, handoffNoteId: string) {
    return this.repository.markAsRead(context.tenantId, context.userId, handoffNoteId);
  }
}
