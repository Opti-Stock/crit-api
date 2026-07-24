import express from "express";

import { configureApi } from "../../config/configure-api.js";
import { registerHealthEndpoints } from "../../config/health.js";
import { pool } from "../../config/db.js";
import { errorMiddleware } from "../../middlewares/error.middleware.js";
import { notFoundMiddleware } from "../../middlewares/not-found.middleware.js";
import { appointmentsRouter } from "../../modules/appointments/appointments.routes.js";
import { attendanceRouter } from "../../modules/attendance/attendance.routes.js";
import { authRouter } from "../../modules/auth/auth.routes.js";
import { calendarRouter } from "../../modules/calendar/calendar.routes.js";
import { clinicsRouter } from "../../modules/clinics/clinics.routes.js";
import { collaboratorsRouter } from "../../modules/collaborators/collaborators.routes.js";
import { handoffNotesRouter } from "../../modules/handoff-notes/handoff-notes.routes.js";
import { medicalNotesRouter } from "../../modules/medical-notes/medical-notes.routes.js";
import { notificationsRouter } from "../../modules/notifications/notifications.routes.js";
import { patientsRouter } from "../../modules/patients/patients.routes.js";
import { realtimeRouter } from "../../modules/realtime/realtime.routes.js";
import { roomsRouter } from "../../modules/rooms/rooms.routes.js";
import { schedulingRouter } from "../../modules/scheduling/scheduling.routes.js";
import { createOpenApiRouter } from "../../openapi/openapi.js";
import { mainOperations } from "../../openapi/operations.js";
import { authenticateRequest } from "../../middlewares/auth.pipeline.js";
import { requireRoles } from "../../middlewares/role.middleware.js";

export const app = express();

configureApi(app);
registerHealthEndpoints(app, "main-api", pool);
app.use("/api", createOpenApiRouter({
  title: "CRIT Assist Main API",
  description: "Operational API. Medical-note content is sensitive and never available to reception roles.",
  operations: mainOperations,
  authorize: [authenticateRequest, requireRoles("admin")]
}));

app.use("/api/auth", authRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/collaborators", collaboratorsRouter);
app.use("/api/clinics", clinicsRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/calendar", calendarRouter);
app.use("/api", schedulingRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/medical-notes", medicalNotesRouter);
app.use("/api/handoff-notes", handoffNotesRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/realtime", realtimeRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);
