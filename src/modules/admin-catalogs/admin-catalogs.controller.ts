import type { RequestHandler } from "express";

import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { AdminCatalogsService } from "./admin-catalogs.service.js";
import {
  adminReasonSchema,
  createAppointmentTypeSchema,
  createClinicSchema,
  createCollaboratorSchema,
  createPatientSchema,
  createRoomSchema,
  idParamsSchema,
  listAdminCatalogsSchema,
  listAuditLogsSchema,
  updateAppointmentTypeSchema,
  updateClinicSchema,
  updateCollaboratorSchema,
  updatePatientSchema,
  updateRoomSchema
} from "./admin-catalogs.validation.js";

export class AdminCatalogsController {
  constructor(private readonly service = new AdminCatalogsService()) {}

  readonly listClinics: RequestHandler = async (request, response) => {
    sendSuccess(response, await this.service.listClinics(request.auth!, parseWithSchema(listAdminCatalogsSchema, request.query)));
  };
  readonly createClinic: RequestHandler = async (request, response) => {
    sendSuccess(response, await this.service.createClinic(request.auth!, parseWithSchema(createClinicSchema, request.body)), 201);
  };
  readonly updateClinic: RequestHandler = async (request, response) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    sendSuccess(response, await this.service.updateClinic(request.auth!, id, parseWithSchema(updateClinicSchema, request.body)));
  };
  readonly deleteClinic: RequestHandler = async (request, response) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const input = parseWithSchema(adminReasonSchema, request.body ?? {});
    await this.service.deleteClinic(request.auth!, id, input);
    response.status(204).send();
  };
  readonly restoreClinic: RequestHandler = async (request, response) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const input = parseWithSchema(adminReasonSchema, request.body ?? {});
    sendSuccess(response, await this.service.restoreClinic(request.auth!, id, input));
  };

  readonly listPatients: RequestHandler = async (request, response) => {
    sendSuccess(response, await this.service.listPatients(request.auth!));
  };
  readonly createPatient: RequestHandler = async (request, response) => {
    sendSuccess(response, await this.service.createPatient(request.auth!, parseWithSchema(createPatientSchema, request.body)), 201);
  };
  readonly updatePatient: RequestHandler = async (request, response) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    sendSuccess(response, await this.service.updatePatient(request.auth!, id, parseWithSchema(updatePatientSchema, request.body)));
  };

  readonly listRooms: RequestHandler = async (request, response) => {
    sendSuccess(response, await this.service.listRooms(request.auth!, parseWithSchema(listAdminCatalogsSchema, request.query)));
  };
  readonly createRoom: RequestHandler = async (request, response) => {
    sendSuccess(response, await this.service.createRoom(request.auth!, parseWithSchema(createRoomSchema, request.body)), 201);
  };
  readonly updateRoom: RequestHandler = async (request, response) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    sendSuccess(response, await this.service.updateRoom(request.auth!, id, parseWithSchema(updateRoomSchema, request.body)));
  };
  readonly deleteRoom: RequestHandler = async (request, response) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const input = parseWithSchema(adminReasonSchema, request.body ?? {});
    await this.service.deleteRoom(request.auth!, id, input);
    response.status(204).send();
  };
  readonly restoreRoom: RequestHandler = async (request, response) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    const input = parseWithSchema(adminReasonSchema, request.body ?? {});
    sendSuccess(response, await this.service.restoreRoom(request.auth!, id, input));
  };

  readonly listAppointmentTypes: RequestHandler = async (request, response) => {
    sendSuccess(response, await this.service.listAppointmentTypes(request.auth!));
  };
  readonly createAppointmentType: RequestHandler = async (request, response) => {
    sendSuccess(response, await this.service.createAppointmentType(request.auth!, parseWithSchema(createAppointmentTypeSchema, request.body)), 201);
  };
  readonly updateAppointmentType: RequestHandler = async (request, response) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    sendSuccess(response, await this.service.updateAppointmentType(request.auth!, id, parseWithSchema(updateAppointmentTypeSchema, request.body)));
  };

  readonly listCollaborators: RequestHandler = async (request, response) => {
    sendSuccess(response, await this.service.listCollaborators(request.auth!));
  };
  readonly createCollaborator: RequestHandler = async (request, response) => {
    sendSuccess(response, await this.service.createCollaborator(request.auth!, parseWithSchema(createCollaboratorSchema, request.body)), 201);
  };
  readonly updateCollaborator: RequestHandler = async (request, response) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    sendSuccess(response, await this.service.updateCollaborator(request.auth!, id, parseWithSchema(updateCollaboratorSchema, request.body)));
  };

  readonly listAuditLogs: RequestHandler = async (request, response) => {
    const input = parseWithSchema(listAuditLogsSchema, request.query);
    const result = await this.service.listAuditLogs(request.auth!, input);
    sendSuccess(response, result.logs, 200, {
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize)
    });
  };
}
