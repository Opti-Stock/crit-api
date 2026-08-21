import type { AuthenticatedRequestContext } from "../../types/global.js";
import { AdminCatalogsRepository } from "./admin-catalogs.repository.js";
import type {
  AdminReasonInput,
  CreateAppointmentTypeInput,
  CreateClinicInput,
  CreateCollaboratorInput,
  CreatePatientInput,
  CreateRoomInput,
  ListAppointmentTypesInput,
  ListAuditLogsInput,
  ListClinicsInput,
  ListRoomsInput,
  UpdateAppointmentTypeInput,
  UpdateClinicInput,
  UpdateCollaboratorInput,
  UpdatePatientInput,
  UpdateRoomInput
} from "./admin-catalogs.validation.js";

export class AdminCatalogsService {
  constructor(private readonly repository = new AdminCatalogsRepository()) {}

  listClinics(context: AuthenticatedRequestContext, input: ListClinicsInput) {
    return this.repository.listClinics(context.tenantId, context.userId, input);
  }
  createClinic(context: AuthenticatedRequestContext, input: CreateClinicInput) {
    return this.repository.createClinic(context.tenantId, context.userId, input);
  }
  updateClinic(context: AuthenticatedRequestContext, id: string, input: UpdateClinicInput) {
    return this.repository.updateClinic(context.tenantId, context.userId, id, input);
  }
  async deleteClinic(context: AuthenticatedRequestContext, id: string, input: AdminReasonInput = {}) {
    await this.repository.softDeleteClinic(context.tenantId, context.userId, id, input.reason);
  }
  restoreClinic(context: AuthenticatedRequestContext, id: string, input: AdminReasonInput = {}) {
    return this.repository.restoreClinic(context.tenantId, context.userId, id, input.reason);
  }

  listPatients(context: AuthenticatedRequestContext) {
    return this.repository.listPatients(context.tenantId, context.userId);
  }
  createPatient(context: AuthenticatedRequestContext, input: CreatePatientInput) {
    return this.repository.createPatient(context.tenantId, context.userId, input);
  }
  updatePatient(context: AuthenticatedRequestContext, id: string, input: UpdatePatientInput) {
    return this.repository.updatePatient(context.tenantId, context.userId, id, input);
  }

  listRooms(context: AuthenticatedRequestContext, input: ListRoomsInput) {
    return this.repository.listRooms(context.tenantId, context.userId, input);
  }
  createRoom(context: AuthenticatedRequestContext, input: CreateRoomInput) {
    return this.repository.createRoom(context.tenantId, context.userId, input);
  }
  updateRoom(context: AuthenticatedRequestContext, id: string, input: UpdateRoomInput) {
    return this.repository.updateRoom(context.tenantId, context.userId, id, input);
  }
  async deleteRoom(context: AuthenticatedRequestContext, id: string, input: AdminReasonInput = {}) {
    await this.repository.softDeleteRoom(context.tenantId, context.userId, id, input.reason);
  }
  restoreRoom(context: AuthenticatedRequestContext, id: string, input: AdminReasonInput = {}) {
    return this.repository.restoreRoom(context.tenantId, context.userId, id, input.reason);
  }

  listAppointmentTypes(context: AuthenticatedRequestContext, input: ListAppointmentTypesInput) {
    return this.repository.listAppointmentTypes(context.tenantId, context.userId, input);
  }
  createAppointmentType(context: AuthenticatedRequestContext, input: CreateAppointmentTypeInput) {
    return this.repository.createAppointmentType(context.tenantId, context.userId, input);
  }
  updateAppointmentType(context: AuthenticatedRequestContext, id: string, input: UpdateAppointmentTypeInput) {
    return this.repository.updateAppointmentType(context.tenantId, context.userId, id, input);
  }

  listCollaborators(context: AuthenticatedRequestContext) {
    return this.repository.listCollaborators(context.tenantId, context.userId);
  }
  createCollaborator(context: AuthenticatedRequestContext, input: CreateCollaboratorInput) {
    return this.repository.createCollaborator(context.tenantId, context.userId, input);
  }
  updateCollaborator(context: AuthenticatedRequestContext, id: string, input: UpdateCollaboratorInput) {
    return this.repository.updateCollaborator(context.tenantId, context.userId, id, input);
  }

  listAuditLogs(context: AuthenticatedRequestContext, input: ListAuditLogsInput) {
    return this.repository.listAuditLogs(context.tenantId, context.userId, input);
  }
}
