import type { RequestHandler } from "express";

import { NotFoundError } from "../../shared/errors/app-error.js";
import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { AttendanceService } from "./attendance.service.js";
import {
  attendanceIdParamsSchema,
  createAttendanceSchema,
  listAttendanceSchema
} from "./attendance.validation.js";

export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  readonly list: RequestHandler = async (request, response) => {
    const input = parseWithSchema(listAttendanceSchema, request.query);
    const result = await this.service.list(request.auth!, input);
    sendSuccess(response, result.records, 200, {
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize)
    });
  };

  readonly get: RequestHandler = async (request, response) => {
    const { attendanceId } = parseWithSchema(attendanceIdParamsSchema, request.params);
    const record = await this.service.get(request.auth!, attendanceId);
    if (!record) throw new NotFoundError("Attendance record not found", "ATTENDANCE_NOT_FOUND");
    sendSuccess(response, record);
  };

  readonly create: RequestHandler = async (request, response) => {
    const input = parseWithSchema(createAttendanceSchema, request.body);
    sendSuccess(response, await this.service.create(request.auth!, input), 201);
  };
}
