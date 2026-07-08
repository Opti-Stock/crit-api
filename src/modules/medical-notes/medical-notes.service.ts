import type { AuthenticatedRequestContext } from "../../types/global.js";
import { resolveOperationalAccessScope } from "../../shared/access/operational-access-scope.js";
import { MedicalNotesRepository } from "./medical-notes.repository.js";
import type { CreateMedicalNoteInput, ListMedicalNotesInput, UpdateMedicalNoteInput } from "./medical-notes.validation.js";

export class MedicalNotesService {
  constructor(private readonly repository = new MedicalNotesRepository()) {}

  list(context: AuthenticatedRequestContext, input: ListMedicalNotesInput) {
    return this.repository.list(
      context.tenantId,
      context.userId,
      context.roles,
      input,
      resolveOperationalAccessScope(context.roles)
    );
  }

  get(context: AuthenticatedRequestContext, medicalNoteId: string) {
    return this.repository.findById(
      context.tenantId,
      context.userId,
      context.roles,
      medicalNoteId,
      resolveOperationalAccessScope(context.roles)
    );
  }

  create(context: AuthenticatedRequestContext, input: CreateMedicalNoteInput) {
    return this.repository.create(context.tenantId, context.userId, input);
  }

  update(context: AuthenticatedRequestContext, medicalNoteId: string, input: UpdateMedicalNoteInput) {
    return this.repository.update(context.tenantId, context.userId, medicalNoteId, input);
  }
}
