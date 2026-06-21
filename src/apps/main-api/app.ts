import cors from "cors";
import express from "express";
import helmet from "helmet";

import { errorMiddleware } from "../../middlewares/error.middleware.js";
import { notFoundMiddleware } from "../../middlewares/not-found.middleware.js";
import { authRouter } from "../../modules/auth/auth.routes.js";

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

app.use(notFoundMiddleware);
app.use(errorMiddleware);
