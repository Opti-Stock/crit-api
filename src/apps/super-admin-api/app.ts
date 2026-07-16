import express from "express";

import { configureApi } from "../../config/configure-api.js";
import { registerHealthEndpoints } from "../../config/health.js";
import { platformPool } from "../../config/platform-db.js";
import { errorMiddleware } from "../../middlewares/error.middleware.js";
import { notFoundMiddleware } from "../../middlewares/not-found.middleware.js";
import { platformRouter } from "../../modules/platform/platform.routes.js";
import { createOpenApiRouter } from "../../openapi/openapi.js";
import { platformOperations } from "../../openapi/operations.js";
import { authenticatePlatformRequest } from "../../middlewares/platform-authentication.middleware.js";

export const app = express();

configureApi(app);
registerHealthEndpoints(app, "super-admin-api", platformPool);
app.use("/super-admin", createOpenApiRouter({
  title: "CRIT Assist Platform API",
  description: "Cross-tenant platform administration API.",
  operations: platformOperations,
  authorize: [authenticatePlatformRequest],
  cookieName: "crit_platform_session"
}));

app.use("/super-admin", platformRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);
