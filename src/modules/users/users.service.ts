import { hash } from "bcrypt";

import { env } from "../../config/env.js";
import type { AuthenticatedRequestContext } from "../../types/global.js";
import { UsersRepository } from "./users.repository.js";
import type {
  ClinicAccessInput,
  CreateUserInput,
  ListUsersInput,
  UpdateUserInput
} from "./users.validation.js";

export class UsersService {
  constructor(
    private readonly repository = new UsersRepository(),
    private readonly hashPassword: (password: string, rounds: number) => Promise<string> = hash
  ) {}

  list(context: AuthenticatedRequestContext, input: ListUsersInput) {
    return this.repository.list(context.tenantId, context.userId, input);
  }

  get(context: AuthenticatedRequestContext, userId: string) {
    return this.repository.findById(context.tenantId, context.userId, userId);
  }

  async create(context: AuthenticatedRequestContext, input: CreateUserInput) {
    const passwordHash = await this.hashPassword(input.password, env.BCRYPT_SALT_ROUNDS);
    return this.repository.create(context.tenantId, context.userId, input, passwordHash);
  }

  update(context: AuthenticatedRequestContext, userId: string, input: UpdateUserInput) {
    return this.repository.update(context.tenantId, context.userId, userId, input);
  }

  async delete(context: AuthenticatedRequestContext, userId: string) {
    await this.repository.softDelete(context.tenantId, context.userId, userId);
  }

  replaceRoles(context: AuthenticatedRequestContext, userId: string, roleIds: string[]) {
    return this.repository.replaceRoles(context.tenantId, context.userId, userId, roleIds);
  }

  replaceClinicAccess(context: AuthenticatedRequestContext, userId: string, access: ClinicAccessInput[]) {
    return this.repository.replaceClinicAccess(context.tenantId, context.userId, userId, access);
  }

  async updatePassword(context: AuthenticatedRequestContext, userId: string, password: string) {
    const passwordHash = await this.hashPassword(password, env.BCRYPT_SALT_ROUNDS);
    await this.repository.updatePassword(context.tenantId, context.userId, userId, passwordHash);
  }
}
