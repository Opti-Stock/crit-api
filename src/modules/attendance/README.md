# Módulo: attendance

Este módulo pertenece a crit-api.

## Propósito

Registro y listado de asistencia, montado en main-api (`/api/attendance`).
`patient_id`/`collaborator_id` se derivan de la cita (`appointmentId`), no se
aceptan en el payload: la FK compuesta de `crit-db` exige que coincidan con
los de `appointments`. El hook de audit log no requiere código adicional:
`withTenantTransaction` ya fija `app.current_user_id`, que es lo que usa el
trigger `audit_attendance_records` en `crit-db`.

## Visibilidad y permisos

- Lectura: admin, direccion (todo el tenant); recepcion, coordinador (sus
  clínicas vía `user_clinic_access`); medico, terapeuta (solo donde son el
  colaborador asignado).
- Registro (`POST`): solo medico, terapeuta, y únicamente para citas donde
  son el colaborador asignado.

## Endpoints

- `GET /api/attendance` — lista paginada (`page`, `pageSize`, `from`, `to`,
  `status`, `clinicId`, `patientId`, `collaboratorId`).
- `GET /api/attendance/:attendanceId` — detalle.
- `POST /api/attendance` — registra asistencia (`appointmentId`, `status`,
  `notesRequired`). Un solo registro por cita.

## Estructura esperada al implementar

attendance/
├── attendance.routes.ts
├── attendance.controller.ts
├── attendance.service.ts
├── attendance.repository.ts
├── attendance.validation.ts
├── attendance.constants.ts
└── README.md

## Responsabilidades por archivo

- routes.ts: definición de endpoints.
- controller.ts: entrada HTTP, request y response.
- service.ts: reglas de negocio.
- repository.ts: acceso a PostgreSQL usando pg.
- validation.ts: validación de payloads.
- constants.ts: estados, enums y constantes del módulo.
