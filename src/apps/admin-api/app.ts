import express from "express";

import { configureApi } from "../../config/configure-api.js";
import { registerHealthEndpoints } from "../../config/health.js";
import { pool } from "../../config/db.js";
import { errorMiddleware } from "../../middlewares/error.middleware.js";
import { notFoundMiddleware } from "../../middlewares/not-found.middleware.js";
import { adminCatalogsRouter } from "../../modules/admin-catalogs/admin-catalogs.routes.js";
import { rolesRouter } from "../../modules/roles/roles.routes.js";
import { usersRouter } from "../../modules/users/users.routes.js";
import { createOpenApiRouter } from "../../openapi/openapi.js";
import { adminOperations } from "../../openapi/operations.js";
import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";

export const app = express();

configureApi(app);
registerHealthEndpoints(app, "admin-api", pool);
app.use("/admin", createOpenApiRouter({
  title: "CRIT Assist Admin API",
  description: "Tenant administration API.",
  operations: adminOperations,
  authorize: [authenticateRequest, requireRoles("admin")]
}));

app.use("/admin/roles", rolesRouter);
app.use("/admin/users", usersRouter);
app.use("/admin", adminCatalogsRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);
