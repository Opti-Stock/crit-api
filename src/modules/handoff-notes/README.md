# Módulo: handoff-notes

Este módulo pertenece a crit-api.

## Propósito

Notas de enlace entre personal, montadas en main-api
(`/api/handoff-notes`). Soportan `recipients` explícitos (tabla
`handoff_note_recipients`), `priority` y `status`.

## Permisos

- **Crear**: admin, medico, terapeuta, personal_acompanamiento (los únicos
  roles que el AC menciona para este módulo).
- **Recipients válidos**: solo usuarios con rol admin, medico o terapeuta
  (validado en el repositorio al crear la nota).
- **Visibilidad**: cada usuario ve las notas que creó o donde es recipient
  (no hay vista de supervisor para admin).
- **Marcar como leída**: solo un recipient de la nota puede marcarla. La
  primera lectura de cualquier recipient promueve `status` de `pending` a
  `read`. No se implementa `archived` (el AC no lo pide).

## Endpoints

- `GET /api/handoff-notes` — lista paginada (`page`, `pageSize`, `status`,
  `priority`).
- `GET /api/handoff-notes/:handoffNoteId` — detalle.
- `POST /api/handoff-notes` — crea la nota (`patientId`, `appointmentId?`,
  `title`, `content`, `priority`, `recipientUserIds`).
- `PATCH /api/handoff-notes/:handoffNoteId/read` — marca como leída para el
  usuario autenticado.

## Estructura esperada al implementar

handoff-notes/
├── handoff-notes.routes.ts
├── handoff-notes.controller.ts
├── handoff-notes.service.ts
├── handoff-notes.repository.ts
├── handoff-notes.validation.ts
├── handoff-notes.constants.ts
└── README.md

## Responsabilidades por archivo

- routes.ts: definición de endpoints.
- controller.ts: entrada HTTP, request y response.
- service.ts: reglas de negocio.
- repository.ts: acceso a PostgreSQL usando pg.
- validation.ts: validación de payloads.
- constants.ts: estados, enums y constantes del módulo.
