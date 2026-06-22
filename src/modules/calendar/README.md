# Módulo: calendar

Este módulo pertenece a crit-api.

## Propósito

Catálogo de solo lectura que da soporte a la creación de citas (`appointments`):
tipos de cita disponibles (`appointment_types`), montado en main-api
(`/api/calendar`). El autosugerido de horarios usando
`collaborator_availability` queda preparado en `crit-db` pero no se
implementa en este módulo.

## Endpoints

- `GET /api/calendar/appointment-types` — catálogo del tenant.

Roles permitidos: admin, direccion, recepcion, coordinador, medico, terapeuta.

## Estructura esperada al implementar

calendar/
├── calendar.routes.ts
├── calendar.controller.ts
├── calendar.service.ts
├── calendar.repository.ts
├── calendar.validation.ts
├── calendar.constants.ts
└── README.md

## Responsabilidades por archivo

- routes.ts: definición de endpoints.
- controller.ts: entrada HTTP, request y response.
- service.ts: reglas de negocio.
- repository.ts: acceso a PostgreSQL usando pg.
- validation.ts: validación de payloads.
- constants.ts: estados, enums y constantes del módulo.
