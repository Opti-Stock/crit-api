# Módulo: medical-notes

Este módulo pertenece a crit-api.

## Propósito

Notas médicas guardadas como datos (JSONB), no como archivos, montadas en
main-api (`/api/medical-notes`). `patient_id`/`collaborator_id` se derivan de
la cita (`appointmentId`); `attendance_record_id` se resuelve automáticamente
si ya existe un registro de asistencia para esa cita. Una sola nota por cita
(constraint de `crit-db`).

## Acceso (defensa en profundidad)

`crit-db` ya protege `medical_notes` con una política RLS que exige rol
activo `medico` o `terapeuta` — cualquier otro rol obtiene 0 filas a nivel de
base de datos sin importar lo que haga la app. Las rutas replican esa misma
restricción (`requireRoles("medico", "terapeuta")`) para devolver 403 en vez
de listas vacías confusas. Recepción nunca llega a este módulo.

Para **crear** una nota, además se verifica que el actor sea el colaborador
asignado en la cita (no se puede escribir una nota sobre la sesión de otro
colaborador). Para **leer**, no hay restricción adicional de propiedad: cualquier
medico/terapeuta del tenant puede ver cualquier nota (continuidad de
cuidado), igual que permite la política RLS.

## Endpoints

- `GET /api/medical-notes` — lista paginada (`page`, `pageSize`, `patientId`,
  `collaboratorId`).
- `GET /api/medical-notes/:medicalNoteId` — detalle.
- `POST /api/medical-notes` — crea la nota (`appointmentId`, `content`,
  `formatVersion`).

## Estructura esperada al implementar

medical-notes/
├── medical-notes.routes.ts
├── medical-notes.controller.ts
├── medical-notes.service.ts
├── medical-notes.repository.ts
├── medical-notes.validation.ts
├── medical-notes.constants.ts
└── README.md

## Responsabilidades por archivo

- routes.ts: definición de endpoints.
- controller.ts: entrada HTTP, request y response.
- service.ts: reglas de negocio.
- repository.ts: acceso a PostgreSQL usando pg.
- validation.ts: validación de payloads.
- constants.ts: estados, enums y constantes del módulo.
