# AGENTS.md

## Project context

This repository is part of the CRIT Assist / CRIT Assistance MVP.

The system aims to reduce operational friction in CRIT attendance registration by helping clinicians, therapists, reception, coordination, administration, and direction manage:

- Attendance registration.
- Medical notes.
- Calendar and appointments.
- Handoff notes.
- Internal notifications.
- Role-based access.
- Multi-CRIT readiness.
- Temporary POST integration with the CRIT institutional API.

The project is organized in three repositories:

- `crit-front`: web frontend.
- `crit-api`: Node.js + Express + TypeScript backend.
- `crit-db`: PostgreSQL database schema, migrations, seeds, and documentation.

## Global working rules

- Work from `dev`, not directly from `main`.
- Use branches with the Linear issue prefix: `feat/OPT-00-description`, `fix/OPT-00-description`, `chore/OPT-00-description`, `docs/OPT-00-description`, `refactor/OPT-00-description`.
- Keep commits small and scoped.
- Do not commit `.env` files, secrets, tokens, passwords, private keys, generated credentials, or local database volumes.
- When adding functionality, update the relevant README or docs.
- Prefer clear, boring, maintainable code over clever abstractions.
- Do not add new frameworks or major dependencies without an explicit task asking for it.
- Keep the MVP focused. Do not implement mobile app, offline mode, payments, or advanced external notification providers unless explicitly requested.
- When something is ambiguous, make the smallest safe assumption and document it in the PR summary.
- Code and docs should use English for technical identifiers and Spanish is acceptable for project-facing documentation if already used in the repo.

## Security and privacy expectations

This project touches healthcare-related operational data. Treat patient, family, appointment, and clinical-note data as sensitive.

- Never log patient clinical content.
- Never expose medical notes to reception users.
- Never return password hashes.
- Never hardcode real patient data.
- Use demo/mock data only in seeds.
- Keep auditability in mind for changes to attendance, notes, users, roles, and appointments.

## Review guidelines

When reviewing or modifying this repository, check for:

- Role-based access regressions.
- Data leakage between CRIT centers.
- Missing validation.
- Missing documentation.
- Unsafe assumptions about external CRIT API availability.
- Overengineering beyond MVP scope.

## Repository: crit-api

### Purpose

`crit-api` is the backend for CRIT Assist.

It contains:

- Main operational API.
- Admin API.
- Shared modules.
- Temporary integration with the external CRIT API.
- Direct PostgreSQL access using `pg`.

### Stack

- Node.js.
- Express.
- TypeScript.
- PostgreSQL.
- `pg`.
- No ORM in the first version.
- Runtime/dev tooling: `tsx`, `typescript`.

### Architecture decision

Use a modular monolith, not microservices.

Two internal apps are expected:

```txt
src/apps/main-api/
src/apps/admin-api/
```

Shared business modules live under:

```txt
src/modules/
```

### Required module pattern

Each module should follow:

```txt
routes -> controller -> service -> repository -> PostgreSQL
```

Expected module files:

```txt
module-name.routes.ts
module-name.controller.ts
module-name.service.ts
module-name.repository.ts
module-name.validation.ts
module-name.constants.ts
README.md
```

Rules:

- Routes define endpoints only.
- Controllers handle HTTP request/response only.
- Services contain business rules.
- Repositories contain SQL access through `pg`.
- Validation is separate.
- Constants/enums are separate.
- Do not execute raw SQL inside controllers.
- Do not couple repositories to Express request/response objects.

### Database connection

The project expects a PostgreSQL pool under:

```txt
src/config/db.ts
```

Use a `Pool` from `pg`, configured through environment variables.

### API boundaries

Main API handles:

- Authentication.
- Attendance.
- Patients.
- Collaborators.
- Clinics and rooms for operational reads.
- Appointments.
- Medical notes.
- Handoff notes.
- Internal notifications.

Admin API handles:

- User management.
- Role management.
- Permission management.
- Administrative clinic/collaborator management.

### Access expectations

- Médicos and terapeutas can register attendance and write medical notes.
- Recepción can see attendance/status but not clinical note content.
- Dirección and admin can manage users and roles.
- Coordinators can manage appointments and operational calendars.
- Personal de acompañamiento can create handoff notes.
- Patient/family login should not be implemented unless explicitly requested.

### Integration expectation

The system saves to PostgreSQL first, then may send a POST to the CRIT institutional API.

Use an outbox-style approach. Do not block the clinical workflow if the external API fails.

### Build and validation commands

Use these once functional files exist:

```bash
npm install
npm run build
npm run lint
npm test
```

If scripts are placeholders, clearly say they are pending.
