export interface AuthenticatedRequestContext {
  userId: string;
  tenantId: string;
  roles: string[];
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedRequestContext;
    }
  }
}

export {};
