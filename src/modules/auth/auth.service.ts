import { compare } from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";

import { UnauthorizedError } from "../../shared/errors/app-error.js";
import { AUTH_ERROR, AUTH_ERROR_CODE } from "./auth.constants.js";
import type {
  AuthCredentialRecord,
  AuthRepositoryContract
} from "./auth.repository.js";
import type { LoginInput } from "./auth.validation.js";

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  roles: string[];
}

export interface LoginResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: AuthenticatedUser;
}

export interface AuthTokenConfig {
  secret: string;
  expiresIn: SignOptions["expiresIn"];
  issuer: string;
  audience: string;
}

type PasswordComparer = (plainText: string, hash: string) => Promise<boolean>;

export class AuthService {
  constructor(
    private readonly repository: AuthRepositoryContract,
    private readonly tokenConfig: AuthTokenConfig,
    private readonly comparePassword: PasswordComparer = compare
  ) {}

  async login(input: LoginInput): Promise<LoginResult> {
    const tenantId = await this.repository.findTenantIdByCode(input.tenantCode);
    if (!tenantId) {
      throw this.invalidCredentials();
    }

    const credentials = await this.repository.findActiveCredentials(tenantId, input.email);
    if (!credentials) {
      throw this.invalidCredentials();
    }

    const passwordMatches = await this.comparePassword(input.password, credentials.passwordHash);
    if (!passwordMatches) {
      throw this.invalidCredentials();
    }

    const accessToken = this.signAccessToken(credentials);
    await this.repository.recordSuccessfulLogin(tenantId, credentials.id);

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: String(this.tokenConfig.expiresIn),
      user: {
        id: credentials.id,
        tenantId: credentials.tenantId,
        fullName: credentials.fullName,
        email: credentials.email,
        roles: credentials.roles
      }
    };
  }

  private signAccessToken(credentials: AuthCredentialRecord): string {
    return jwt.sign(
      {
        tenantId: credentials.tenantId,
        roles: credentials.roles
      },
      this.tokenConfig.secret,
      {
        algorithm: "HS256",
        subject: credentials.id,
        expiresIn: this.tokenConfig.expiresIn,
        issuer: this.tokenConfig.issuer,
        audience: this.tokenConfig.audience
      }
    );
  }

  private invalidCredentials(): UnauthorizedError {
    return new UnauthorizedError(
      AUTH_ERROR.invalidCredentials,
      AUTH_ERROR_CODE.invalidCredentials
    );
  }
}
