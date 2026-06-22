import type { AuthenticatedRequestContext } from "../../types/global.js";
import { ClinicsRepository } from "./clinics.repository.js";
import type { ListClinicsInput } from "./clinics.validation.js";

export class ClinicsService {
  constructor(private readonly repository = new ClinicsRepository()) {}

  list(context: AuthenticatedRequestContext, input: ListClinicsInput) {
    return this.repository.list(context.tenantId, context.userId, input);
  }

  get(context: AuthenticatedRequestContext, clinicId: string) {
    return this.repository.findById(context.tenantId, context.userId, clinicId);
  }
}
