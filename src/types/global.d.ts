export interface AuthenticatedRequestContext {
  userId: string;
  tenantId: string;
  roles: string[];
}

export interface PlatformAuthenticatedRequestContext {
  superAdminId: string;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthenticatedRequestContext;
      platformAuth?: PlatformAuthenticatedRequestContext;
    }
  }
}

export {};
