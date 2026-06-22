# Módulo: rooms

Este módulo pertenece a crit-api.

## Propósito

Endpoints operativos de solo lectura para cuartos, montados en main-api
(`/api/rooms`). Cada cuarto pertenece a una única clínica
(`rooms.clinic_id`); una clínica puede tener varios cuartos.

## Endpoints

- `GET /api/rooms` — lista paginada (`page`, `pageSize`, `search`, `status`,
  `clinicId`), incluye la clínica a la que pertenece cada cuarto.
- `GET /api/rooms/:roomId` — detalle.

Roles permitidos: admin, direccion, recepcion, coordinador, medico, terapeuta,
personal_acompanamiento.

## Estructura esperada al implementar

rooms/
├── rooms.routes.ts
├── rooms.controller.ts
├── rooms.service.ts
├── rooms.repository.ts
├── rooms.validation.ts
├── rooms.constants.ts
└── README.md

## Responsabilidades por archivo

- routes.ts: definición de endpoints.
- controller.ts: entrada HTTP, request y response.
- service.ts: reglas de negocio.
- repository.ts: acceso a PostgreSQL usando pg.
- validation.ts: validación de payloads.
- constants.ts: estados, enums y constantes del módulo.
