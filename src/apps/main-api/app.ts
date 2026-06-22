import cors from "cors";
import express from "express";
import helmet from "helmet";

import { errorMiddleware } from "../../middlewares/error.middleware.js";
import { notFoundMiddleware } from "../../middlewares/not-found.middleware.js";
import { appointmentsRouter } from "../../modules/appointments/appointments.routes.js";
import { attendanceRouter } from "../../modules/attendance/attendance.routes.js";
import { authRouter } from "../../modules/auth/auth.routes.js";
import { calendarRouter } from "../../modules/calendar/calendar.routes.js";
import { collaboratorsRouter } from "../../modules/collaborators/collaborators.routes.js";
import { handoffNotesRouter } from "../../modules/handoff-notes/handoff-notes.routes.js";
import { medicalNotesRouter } from "../../modules/medical-notes/medical-notes.routes.js";
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
app.use("/api/calendar", calendarRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/medical-notes", medicalNotesRouter);
app.use("/api/handoff-notes", handoffNotesRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);
