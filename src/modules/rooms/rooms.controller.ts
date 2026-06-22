import type { RequestHandler } from "express";

import { NotFoundError } from "../../shared/errors/app-error.js";
import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { RoomsService } from "./rooms.service.js";
import { listRoomsSchema, roomIdParamsSchema } from "./rooms.validation.js";

export class RoomsController {
  constructor(private readonly service = new RoomsService()) {}

  readonly list: RequestHandler = async (request, response) => {
    const input = parseWithSchema(listRoomsSchema, request.query);
    const result = await this.service.list(request.auth!, input);
    sendSuccess(response, result.rooms, 200, {
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize)
    });
  };

  readonly get: RequestHandler = async (request, response) => {
    const { roomId } = parseWithSchema(roomIdParamsSchema, request.params);
    const room = await this.service.get(request.auth!, roomId);
    if (!room) throw new NotFoundError("Room not found", "ROOM_NOT_FOUND");
    sendSuccess(response, room);
  };
}
