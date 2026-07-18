import type { Express } from "express";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./env.js";
import { corsOptions } from "./cors.js";
import { requestIdMiddleware } from "../middlewares/request-id.middleware.js";
import { requireTrustedOrigin } from "../middlewares/origin-protection.middleware.js";

export function configureApi(app: Express): void {
  if (env.APP_ENV !== "local") app.set("trust proxy", 1);

  app.disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    }
  }));
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "1mb" }));
  app.use(requireTrustedOrigin);
  app.use((request, response, next) => {
    const startedAt = Date.now();
    response.on("finish", () => {
      console.info(JSON.stringify({
        level: "info",
        event: "http_request",
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt
      }));
    });
    next();
  });
}
