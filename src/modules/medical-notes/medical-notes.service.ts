import type { AuthenticatedRequestContext } from "../../types/global.js";
import { MedicalNotesRepository } from "./medical-notes.repository.js";
import type { CreateMedicalNoteInput, ListMedicalNotesInput } from "./medical-notes.validation.js";

export class MedicalNotesService {
  constructor(private readonly repository = new MedicalNotesRepository()) {}

  list(context: AuthenticatedRequestContext, input: ListMedicalNotesInput) {
    return this.repository.list(context.tenantId, context.userId, input);
  }

  get(context: AuthenticatedRequestContext, medicalNoteId: string) {
    return this.repository.findById(context.tenantId, context.userId, medicalNoteId);
  }

  create(context: AuthenticatedRequestContext, input: CreateMedicalNoteInput) {
    return this.repository.create(context.tenantId, context.userId, input);
  }
}
