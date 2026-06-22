import type { AuthenticatedRequestContext } from "../../types/global.js";
import { RoomsRepository } from "./rooms.repository.js";
import type { ListRoomsInput } from "./rooms.validation.js";

export class RoomsService {
  constructor(private readonly repository = new RoomsRepository()) {}

  list(context: AuthenticatedRequestContext, input: ListRoomsInput) {
    return this.repository.list(context.tenantId, context.userId, input);
  }

  get(context: AuthenticatedRequestContext, roomId: string) {
    return this.repository.findById(context.tenantId, context.userId, roomId);
  }
}
