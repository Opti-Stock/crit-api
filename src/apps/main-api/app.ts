import cors from "cors";
import express from "express";
import helmet from "helmet";

import { errorMiddleware } from "../../middlewares/error.middleware.js";
import { notFoundMiddleware } from "../../middlewares/not-found.middleware.js";
import { authRouter } from "../../modules/auth/auth.routes.js";
import { collaboratorsRouter } from "../../modules/collaborators/collaborators.routes.js";
import { patientsRouter } from "../../modules/patients/patients.routes.js";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "main-api"
  });
});

app.use("/api/auth", authRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/collaborators", collaboratorsRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);
