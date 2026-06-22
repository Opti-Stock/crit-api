import type { AuthenticatedRequestContext } from "../../types/global.js";
import { PatientsRepository } from "./patients.repository.js";
import type { ListPatientsInput } from "./patients.validation.js";

export class PatientsService {
  constructor(private readonly repository = new PatientsRepository()) {}

  list(context: AuthenticatedRequestContext, input: ListPatientsInput) {
    return this.repository.list(context.tenantId, context.userId, input);
  }

  get(context: AuthenticatedRequestContext, patientId: string) {
    return this.repository.findById(context.tenantId, context.userId, patientId);
  }
}
