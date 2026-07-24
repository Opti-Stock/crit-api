import type { RequestHandler } from "express";

import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { SchedulingConfigService } from "./scheduling-config.service.js";
import {
  appointmentTypeAssignmentsSchema,
  clinicSchedulingParamsSchema,
  collaboratorSchedulingParamsSchema,
  createSchedulingBlockSchema,
  operatingHoursSchema,
  patientPreferencesSchema,
  patientSchedulingParamsSchema,
  roomSchedulingParamsSchema,
  schedulingBlockParamsSchema,
  schedulingBlocksQuerySchema
} from "./scheduling-config.validation.js";

export class SchedulingConfigController {
  constructor(private readonly service = new SchedulingConfigService()) {}

  readonly listOperatingHours: RequestHandler = async (request, response) => {
    const { clinicId } = parseWithSchema(clinicSchedulingParamsSchema, request.params);
    sendSuccess(response, await this.service.listOperatingHours(request.auth!, clinicId));
  };

  readonly replaceOperatingHours: RequestHandler = async (request, response) => {
    const { clinicId } = parseWithSchema(clinicSchedulingParamsSchema, request.params);
    const input = parseWithSchema(operatingHoursSchema, request.body);
    sendSuccess(response, await this.service.replaceOperatingHours(request.auth!, clinicId, input));
  };

  readonly listClinicAppointmentTypes: RequestHandler = async (request, response) => {
    const { clinicId } = parseWithSchema(clinicSchedulingParamsSchema, request.params);
    sendSuccess(response, await this.service.listClinicAppointmentTypes(request.auth!, clinicId));
  };

  readonly replaceClinicAppointmentTypes: RequestHandler = async (request, response) => {
    const { clinicId } = parseWithSchema(clinicSchedulingParamsSchema, request.params);
    const input = parseWithSchema(appointmentTypeAssignmentsSchema, request.body);
    sendSuccess(response, await this.service.replaceClinicAppointmentTypes(request.auth!, clinicId, input));
  };

  readonly listCollaboratorAppointmentTypes: RequestHandler = async (request, response) => {
    const { clinicId, collaboratorId } = parseWithSchema(collaboratorSchedulingParamsSchema, request.params);
    sendSuccess(response, await this.service.listCollaboratorAppointmentTypes(request.auth!, clinicId, collaboratorId));
  };

  readonly replaceCollaboratorAppointmentTypes: RequestHandler = async (request, response) => {
    const { clinicId, collaboratorId } = parseWithSchema(collaboratorSchedulingParamsSchema, request.params);
    const input = parseWithSchema(appointmentTypeAssignmentsSchema, request.body);
    sendSuccess(response, await this.service.replaceCollaboratorAppointmentTypes(request.auth!, clinicId, collaboratorId, input));
  };

  readonly listRoomAppointmentTypes: RequestHandler = async (request, response) => {
    const { clinicId, roomId } = parseWithSchema(roomSchedulingParamsSchema, request.params);
    sendSuccess(response, await this.service.listRoomAppointmentTypes(request.auth!, clinicId, roomId));
  };

  readonly replaceRoomAppointmentTypes: RequestHandler = async (request, response) => {
    const { clinicId, roomId } = parseWithSchema(roomSchedulingParamsSchema, request.params);
    const input = parseWithSchema(appointmentTypeAssignmentsSchema, request.body);
    sendSuccess(response, await this.service.replaceRoomAppointmentTypes(request.auth!, clinicId, roomId, input));
  };

  readonly listBlocks: RequestHandler = async (request, response) => {
    const { clinicId } = parseWithSchema(clinicSchedulingParamsSchema, request.params);
    const query = parseWithSchema(schedulingBlocksQuerySchema, request.query);
    sendSuccess(response, await this.service.listBlocks(request.auth!, clinicId, query));
  };

  readonly createBlock: RequestHandler = async (request, response) => {
    const { clinicId } = parseWithSchema(clinicSchedulingParamsSchema, request.params);
    const input = parseWithSchema(createSchedulingBlockSchema, request.body);
    sendSuccess(response, await this.service.createBlock(request.auth!, clinicId, input), 201);
  };

  readonly deleteBlock: RequestHandler = async (request, response) => {
    const { clinicId, blockId } = parseWithSchema(schedulingBlockParamsSchema, request.params);
    await this.service.deleteBlock(request.auth!, clinicId, blockId);
    response.status(204).send();
  };

  readonly listPatientPreferences: RequestHandler = async (request, response) => {
    const { clinicId, patientId } = parseWithSchema(patientSchedulingParamsSchema, request.params);
    sendSuccess(response, await this.service.listPatientPreferences(request.auth!, clinicId, patientId));
  };

  readonly replacePatientPreferences: RequestHandler = async (request, response) => {
    const { clinicId, patientId } = parseWithSchema(patientSchedulingParamsSchema, request.params);
    const input = parseWithSchema(patientPreferencesSchema, request.body);
    sendSuccess(response, await this.service.replacePatientPreferences(request.auth!, clinicId, patientId, input));
  };
}
