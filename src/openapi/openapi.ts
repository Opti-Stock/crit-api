import { Router, type RequestHandler } from "express";
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";

import { env } from "../config/env.js";

extendZodWithOpenApi(z);

export interface OpenApiOperation {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  summary: string;
  tag: string;
  roles?: string[];
}

export function createOpenApiRouter(options: {
  title: string;
  description: string;
  operations: OpenApiOperation[];
  authorize: RequestHandler[];
  cookieName?: string;
}): Router {
  const router = Router();
  if (!env.OPENAPI_ENABLED) return router;

  const document = buildDocument(options);
  router.get("/openapi.json", ...options.authorize, (_request, response) => response.json(document));
  router.use(
    "/docs",
    ...options.authorize,
    (_request, response, next) => {
      response.setHeader(
        "content-security-policy",
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'"
      );
      next();
    },
    ...swaggerUi.serve,
    swaggerUi.setup(document, { customSiteTitle: options.title })
  );
  return router;
}

function buildDocument(options: {
  title: string;
  description: string;
  operations: OpenApiOperation[];
  cookieName?: string;
}) {
  const registry = new OpenAPIRegistry();
  const errorSchema = registry.register("Error", z.object({
    success: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      requestId: z.string(),
      details: z.array(z.object({ path: z.string(), message: z.string() })).optional()
    })
  }));

  for (const operation of options.operations) {
    const parameters = Object.fromEntries(
      [...operation.path.matchAll(/\{([^}]+)\}/g)].map((match) => [match[1], z.uuid()])
    );
    const errorResponse = (description: string) => ({
      description,
      content: { "application/json": { schema: errorSchema } }
    });
    registry.registerPath({
      method: operation.method,
      path: operation.path,
      summary: operation.summary,
      tags: [operation.tag],
      security: operation.roles?.length === 0 ? [] : [{ cookieAuth: [] }, { bearerAuth: [] }],
      description: operation.roles?.length ? `Allowed roles: ${operation.roles.join(", ")}` : undefined,
      request: {
        ...(Object.keys(parameters).length ? { params: z.object(parameters) } : {}),
        ...(["post", "put", "patch"].includes(operation.method) ? {
          body: {
            required: true,
            content: { "application/json": { schema: z.record(z.string(), z.unknown()) } }
          }
        } : {})
      },
      responses: {
        "200": { description: "Successful response" },
        "400": errorResponse("Bad request"),
        "401": errorResponse("Authentication required"),
        "403": errorResponse("Insufficient permissions"),
        "404": errorResponse("Resource not found"),
        "409": errorResponse("Resource conflict"),
        "422": errorResponse("Validation failed"),
        "429": errorResponse("Rate limit exceeded"),
        "500": errorResponse("Unexpected server error"),
        "503": errorResponse("Service unavailable")
      }
    });
  }

  registry.registerComponent("securitySchemes", "cookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: options.cookieName ?? "crit_session"
  });
  registry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Technical integrations only"
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: options.title, version: "0.1.0", description: options.description },
    servers: [{ url: "/", description: "Same-origin CRIT Assist gateway" }]
  });
}
