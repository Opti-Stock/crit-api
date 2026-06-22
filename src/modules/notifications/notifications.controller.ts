import type { RequestHandler } from "express";

import { NotFoundError } from "../../shared/errors/app-error.js";
import { sendSuccess } from "../../shared/responses/api-response.js";
import { parseWithSchema } from "../../shared/validators/parse-with-schema.js";
import { NotificationsService } from "./notifications.service.js";
import {
  createNotificationSchema,
  listNotificationsSchema,
  notificationIdParamsSchema
} from "./notifications.validation.js";

export class NotificationsController {
  constructor(private readonly service = new NotificationsService()) {}

  readonly list: RequestHandler = async (request, response) => {
    const input = parseWithSchema(listNotificationsSchema, request.query);
    const result = await this.service.list(request.auth!, input);
    sendSuccess(response, result.notifications, 200, {
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize)
    });
  };

  readonly get: RequestHandler = async (request, response) => {
    const { notificationId } = parseWithSchema(notificationIdParamsSchema, request.params);
    const notification = await this.service.get(request.auth!, notificationId);
    if (!notification) throw new NotFoundError("Notification not found", "NOTIFICATION_NOT_FOUND");
    sendSuccess(response, notification);
  };

  readonly create: RequestHandler = async (request, response) => {
    const input = parseWithSchema(createNotificationSchema, request.body);
    sendSuccess(response, await this.service.create(request.auth!, input), 201);
  };

  readonly markAsRead: RequestHandler = async (request, response) => {
    const { notificationId } = parseWithSchema(notificationIdParamsSchema, request.params);
    sendSuccess(response, await this.service.markAsRead(request.auth!, notificationId));
  };

  readonly markAsUnread: RequestHandler = async (request, response) => {
    const { notificationId } = parseWithSchema(notificationIdParamsSchema, request.params);
    sendSuccess(response, await this.service.markAsUnread(request.auth!, notificationId));
  };
}
