import type { RequestHandler } from "express";

import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { AdminCatalogsService } from "./admin-catalogs.service.js";
import {
  createAppointmentTypeSchema,
  createClinicSchema,
  createCollaboratorSchema,
  createPatientSchema,
  createRoomSchema,
  idParamsSchema,
  updateAppointmentTypeSchema,
  updateClinicSchema,
  updateCollaboratorSchema,
  updatePatientSchema,
  updateRoomSchema
} from "./admin-catalogs.validation.js";

export class AdminCatalogsController {
  constructor(private readonly service = new AdminCatalogsService()) {}

  readonly listClinics: RequestHandler = async (request, response) => {
    sendSuccess(response, await this.service.listClinics(request.auth!));
  };
  readonly createClinic: RequestHandler = async (request, response) => {
    sendSuccess(response, await this.service.createClinic(request.auth!, parseWithSchema(createClinicSchema, request.body)), 201);
  };
  readonly updateClinic: RequestHandler = async (request, response) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    sendSuccess(response, await this.service.updateClinic(request.auth!, id, parseWithSchema(updateClinicSchema, request.body)));
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
    sendSuccess(response, await this.service.listRooms(request.auth!));
  };
  readonly createRoom: RequestHandler = async (request, response) => {
    sendSuccess(response, await this.service.createRoom(request.auth!, parseWithSchema(createRoomSchema, request.body)), 201);
  };
  readonly updateRoom: RequestHandler = async (request, response) => {
    const { id } = parseWithSchema(idParamsSchema, request.params);
    sendSuccess(response, await this.service.updateRoom(request.auth!, id, parseWithSchema(updateRoomSchema, request.body)));
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
}
