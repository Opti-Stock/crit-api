import cors from "cors";
import express from "express";
import helmet from "helmet";

import { corsOptions } from "../../config/cors.js";
import { errorMiddleware } from "../../middlewares/error.middleware.js";
import { notFoundMiddleware } from "../../middlewares/not-found.middleware.js";
import { adminCatalogsRouter } from "../../modules/admin-catalogs/admin-catalogs.routes.js";
import { rolesRouter } from "../../modules/roles/roles.routes.js";
import { usersRouter } from "../../modules/users/users.routes.js";

export const app = express();

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());

app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "admin-api"
  });
});

app.use("/admin/roles", rolesRouter);
app.use("/admin/users", usersRouter);
app.use("/admin", adminCatalogsRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);
