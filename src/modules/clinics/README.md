# Módulo: clinics

Este módulo pertenece a crit-api.

## Propósito

Endpoints operativos de solo lectura para clínicas, montados en main-api
(`/api/clinics`). Una clínica puede tener varios cuartos (`rooms.clinic_id`)
y un coordinador opcional (`clinics.coordinator_id` → `collaborators`).

## Endpoints

- `GET /api/clinics` — lista paginada (`page`, `pageSize`, `search`,
  `status`), incluye `coordinator` y `roomCount`.
- `GET /api/clinics/:clinicId` — detalle, incluye `rooms`.

Roles permitidos: admin, direccion, recepcion, coordinador, medico, terapeuta,
personal_acompanamiento.

## Estructura esperada al implementar

clinics/
├── clinics.routes.ts
├── clinics.controller.ts
├── clinics.service.ts
├── clinics.repository.ts
├── clinics.validation.ts
├── clinics.constants.ts
└── README.md

## Responsabilidades por archivo

- routes.ts: definición de endpoints.
- controller.ts: entrada HTTP, request y response.
- service.ts: reglas de negocio.
- repository.ts: acceso a PostgreSQL usando pg.
- validation.ts: validación de payloads.
- constants.ts: estados, enums y constantes del módulo.
