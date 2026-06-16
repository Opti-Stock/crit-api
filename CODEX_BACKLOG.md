# CODEX_BACKLOG.md

# crit-api Codex backlog

## Current state

The repository has the initial folder structure, module placeholders, config files, Docker placeholders, README, and documentation skeleton.

It does not yet contain functional API code.

## Product scope for this repo

Build the backend for:

- Main API.
- Admin API.
- Auth.
- Role-based access.
- Attendance.
- Medical notes.
- Appointments/calendar.
- Handoff notes.
- Internal notifications.
- Temporary POST integration to external CRIT API.
- PostgreSQL access through `pg`.

Do not build:

- Separate microservices.
- ORM/Prisma/TypeORM.
- Payments.
- Offline mode.
- Full SMS/WhatsApp provider implementation unless explicitly requested.

## Recommended implementation order

### OPT-API-01 — Create TypeScript app entrypoints

Goal:

- Add minimal Express server entrypoints for main API and admin API.

Expected files:

```txt
src/apps/main-api/app.ts
src/apps/main-api/server.ts
src/apps/admin-api/app.ts
src/apps/admin-api/server.ts
src/config/env.ts
src/config/cors.ts
```

Acceptance criteria:

- `npm run build` passes.
- Main API listens on `MAIN_API_PORT`.
- Admin API listens on `ADMIN_API_PORT`.
- `/health` exists for both apps.
- No database dependency is required for health check.

### OPT-API-02 — Add PostgreSQL pool config

Goal:

- Implement database connection using `pg`.

Expected files:

```txt
src/config/db.ts
```

Acceptance criteria:

- Uses `DATABASE_URL`.
- Pool settings include max connections, idle timeout, and connection timeout.
- Does not log secrets.
- Provides a reusable exported pool.

### OPT-API-03 — Add shared error/response/validation utilities

Goal:

- Establish basic API conventions.

Expected files:

```txt
src/shared/responses/
src/shared/errors/
src/shared/validators/
src/middlewares/error.middleware.ts
```

Acceptance criteria:

- Controllers can return consistent success/error responses.
- Error middleware exists.
- Validation strategy is documented.

### OPT-API-04 — Implement auth module skeleton

Goal:

- Create auth routes/controllers/services/repositories/validation.

Expected files:

```txt
src/modules/auth/auth.routes.ts
src/modules/auth/auth.controller.ts
src/modules/auth/auth.service.ts
src/modules/auth/auth.repository.ts
src/modules/auth/auth.validation.ts
src/modules/auth/auth.constants.ts
```

Acceptance criteria:

- No hardcoded users.
- JWT strategy is prepared.
- Password hashing uses bcrypt.
- Login contract is documented.
- Does not expose password hashes.

### OPT-API-05 — Implement auth and role middlewares

Goal:

- Protect routes with authentication and role checks.

Expected files:

```txt
src/middlewares/auth.middleware.ts
src/middlewares/role.middleware.ts
src/middlewares/tenant.middleware.ts
```

Acceptance criteria:

- Middleware can attach user context.
- Middleware can enforce allowed roles.
- Tenant/CRIT center context is prepared.
- Reception role must not access medical-note content.

### OPT-API-06 — Implement users and roles admin modules

Goal:

- Add admin API endpoints for users, roles, and assignments.

Acceptance criteria:

- Admin routes live under admin API.
- Only admin/direccion should access these routes.
- User-role assignment supports multiple roles per user.
- User-clinic access is supported or prepared.

### OPT-API-07 — Implement patients/collaborators/clinics/rooms read modules

Goal:

- Add operational read endpoints for base entities.

Acceptance criteria:

- Queries are scoped by `crit_center_id`.
- Collaborators can belong to multiple clinics.
- Clinics can have multiple rooms.
- No clinical notes are leaked to reception.

### OPT-API-08 — Implement appointments/calendar module

Goal:

- Add manual appointment creation and listing.

Acceptance criteria:

- Appointment includes patient, collaborator, clinic, room, type, start, end, pre-session, post-session, status.
- Médico/terapeuta sees own appointments.
- Reception sees appointments for their clinic.
- Autosuggest is prepared but not implemented unless requested.

### OPT-API-09 — Implement attendance module

Goal:

- Register and update appointment attendance.

Acceptance criteria:

- Status supports: `pending`, `present`, `absent`, `late`, `cancelled`, `rescheduled`.
- Médicos and terapeutas can register attendance.
- Audit log hook is prepared.
- Attendance can mark whether note is required.

### OPT-API-10 — Implement medical notes module

Goal:

- Store and retrieve medical-note data.

Acceptance criteria:

- Notes are stored as data, not PDF files.
- Only authorized clinical roles can access content.
- Reception cannot access content.
- Notes link to attendance, appointment, patient, and collaborator.

### OPT-API-11 — Implement handoff notes module

Goal:

- Create, list, and mark handoff notes as read.

Acceptance criteria:

- Notes support recipients.
- Notes support priority and status.
- Personal de acompañamiento can create notes if authorized.
- Médico/terapeuta/admin-specific users can receive notes.

### OPT-API-12 — Implement notifications module

Goal:

- Add internal notification endpoints.

Acceptance criteria:

- Supports unread/read.
- Notification types include appointment reminder, pending note, unregistered attendance, appointment change, handoff note received, administrative alert.
- External patient reminders are prepared but not implemented.

### OPT-API-13 — Implement CRIT API outbox integration skeleton

Goal:

- Prepare reliable POST integration with external CRIT API.

Acceptance criteria:

- Saves outbox records before sending.
- Failed sends do not block clinical workflow.
- Retry count and last error are tracked.
- External URL/token come from env.
