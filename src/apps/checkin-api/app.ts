import express from "express";

import { configureApi } from "../../config/configure-api.js";
import { registerHealthEndpoints } from "../../config/health.js";
import { pool } from "../../config/db.js";
import { errorMiddleware } from "../../middlewares/error.middleware.js";
import { notFoundMiddleware } from "../../middlewares/not-found.middleware.js";
import { checkinRouter } from "../../modules/checkin/checkin.routes.js";
import { createOpenApiRouter } from "../../openapi/openapi.js";
import { checkinOperations } from "../../openapi/operations.js";
import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";

export const app = express();

configureApi(app);
registerHealthEndpoints(app, "checkin-api", pool);
app.use("/checkin", createOpenApiRouter({
  title: "CRIT Assist Check-in API",
  description: "Reception and barcode check-in API.",
  operations: checkinOperations,
  authorize: [authenticateRequest, requireRoles("admin")]
}));

app.use("/checkin", checkinRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);
