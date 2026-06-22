# Módulo: notifications

Este módulo pertenece a crit-api.

## Propósito

Notificaciones internas por usuario, montadas en main-api
(`/api/notifications`). Soporta unread/read. `notifications` no tiene RLS
por usuario en `crit-db` (solo aísla por tenant), así que el repositorio
siempre filtra `user_id = actor` explícitamente — cada quien solo puede ver
y marcar sus propias notificaciones.

## Tipos soportados (`type`)

`appointment_reminder`, `pending_note`, `unregistered_attendance`,
`appointment_change`, `handoff_note_received`, `administrative_alert`.

Disparados automáticamente hoy:

- `handoff_note_received`: al crear una handoff note (módulo
  `handoff-notes`), para cada recipient.
- `pending_note`: al registrar asistencia con `notesRequired: true`
  (módulo `attendance`), para el colaborador que la registró.

Sin disparo automático todavía (requieren infraestructura que no existe en
este repo, igual que los recordatorios externos a pacientes):

- `appointment_reminder`, `unregistered_attendance`: necesitan un
  scheduler/cron para detectar citas próximas o asistencias sin registrar.
- `appointment_change`: necesita un endpoint de actualización de citas que
  no existe (`appointments` solo soporta crear y listar).
- `administrative_alert`: se crea manualmente vía `POST`, no automático por
  diseño.

## Endpoints

- `GET /api/notifications` — lista paginada (`page`, `pageSize`, `status`:
  `unread`/`read`).
- `GET /api/notifications/:notificationId` — detalle.
- `PATCH /api/notifications/:notificationId/read` — marca como leída.
- `PATCH /api/notifications/:notificationId/unread` — marca como no leída.
- `POST /api/notifications` — crea una notificación manual para otro
  usuario. Roles: admin, direccion.

## Estructura esperada al implementar

notifications/
├── notifications.routes.ts
├── notifications.controller.ts
├── notifications.service.ts
├── notifications.repository.ts
├── notifications.validation.ts
├── notifications.constants.ts
└── README.md

## Responsabilidades por archivo

- routes.ts: definición de endpoints.
- controller.ts: entrada HTTP, request y response.
- service.ts: reglas de negocio.
- repository.ts: acceso a PostgreSQL usando pg.
- validation.ts: validación de payloads.
- constants.ts: estados, enums y constantes del módulo.
