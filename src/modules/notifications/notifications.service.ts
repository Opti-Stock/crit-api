import type { AuthenticatedRequestContext } from "../../types/global.js";
import { NotificationsRepository } from "./notifications.repository.js";
import type { CreateNotificationInput, ListNotificationsInput } from "./notifications.validation.js";

export class NotificationsService {
  constructor(private readonly repository = new NotificationsRepository()) {}

  list(context: AuthenticatedRequestContext, input: ListNotificationsInput) {
    return this.repository.list(context.tenantId, context.userId, input);
  }

  get(context: AuthenticatedRequestContext, notificationId: string) {
    return this.repository.findById(context.tenantId, context.userId, notificationId);
  }

  create(context: AuthenticatedRequestContext, input: CreateNotificationInput) {
    return this.repository.create(context.tenantId, context.userId, input);
  }

  markAsRead(context: AuthenticatedRequestContext, notificationId: string) {
    return this.repository.setReadState(context.tenantId, context.userId, notificationId, true);
  }

  markAsUnread(context: AuthenticatedRequestContext, notificationId: string) {
    return this.repository.setReadState(context.tenantId, context.userId, notificationId, false);
  }
}
