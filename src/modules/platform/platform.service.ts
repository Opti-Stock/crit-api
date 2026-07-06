import { compare, hash } from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";

import { env } from "../../config/env.js";
import { UnauthorizedError } from "../../shared/errors/app-error.js";
import type { PlatformAuthenticatedRequestContext } from "../../types/global.js";
import { PlatformRepository } from "./platform.repository.js";
import type {
  CreateTenantAdminInput,
  CreateTenantInput,
  PlatformLoginInput,
  UpdateTenantInput
} from "./platform.validation.js";

export interface PlatformLoginResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  superAdmin: {
    id: string;
    fullName: string;
    email: string;
  };
}

export class PlatformService {
  constructor(
    private readonly repository = new PlatformRepository(),
    private readonly comparePassword: (plainText: string, hash: string) => Promise<boolean> = compare,
    private readonly hashPassword: (plainText: string, rounds: number) => Promise<string> = hash
  ) {}

  async login(input: PlatformLoginInput): Promise<PlatformLoginResult> {
    const credentials = await this.repository.findActiveCredentialsByEmail(input.email);
    if (!credentials) throw this.invalidCredentials();

    const passwordMatches = await this.comparePassword(input.password, credentials.passwordHash);
    if (!passwordMatches) throw this.invalidCredentials();

    const accessToken = jwt.sign(
      { scope: "platform_super_admin" },
      env.PLATFORM_JWT_SECRET,
      {
        algorithm: "HS256",
        subject: credentials.id,
        expiresIn: env.PLATFORM_JWT_EXPIRES_IN as SignOptions["expiresIn"],
        issuer: env.PLATFORM_JWT_ISSUER,
        audience: env.PLATFORM_JWT_AUDIENCE
      }
    );
    await this.repository.recordSuccessfulLogin(credentials.id);

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: env.PLATFORM_JWT_EXPIRES_IN,
      superAdmin: {
        id: credentials.id,
        fullName: credentials.fullName,
        email: credentials.email
      }
    };
  }

  me(context: PlatformAuthenticatedRequestContext) {
    return { id: context.superAdminId, scope: "platform_super_admin" };
  }

  listTenants() {
    return this.repository.listTenants();
  }

  getTenant(_context: PlatformAuthenticatedRequestContext, tenantId: string) {
    return this.repository.getTenant(tenantId);
  }

  createTenant(context: PlatformAuthenticatedRequestContext, input: CreateTenantInput) {
    return this.repository.createTenant(context.superAdminId, input);
  }

  updateTenant(context: PlatformAuthenticatedRequestContext, tenantId: string, input: UpdateTenantInput) {
    return this.repository.updateTenant(context.superAdminId, tenantId, input);
  }

  async createFirstTenantAdmin(
    context: PlatformAuthenticatedRequestContext,
    tenantId: string,
    input: CreateTenantAdminInput
  ) {
    const passwordHash = await this.hashPassword(input.password, env.BCRYPT_SALT_ROUNDS);
    return this.repository.createFirstTenantAdmin(context.superAdminId, tenantId, input, passwordHash);
  }

  private invalidCredentials(): UnauthorizedError {
    return new UnauthorizedError("Invalid email or password", "INVALID_PLATFORM_CREDENTIALS");
  }
}
