# Módulo: patients

Este módulo pertenece a crit-api.

## Propósito

Endpoints de solo lectura para pacientes, montados en main-api (`/api/patients`).
Las queries quedan scoped por `tenant_id` (vía `withTenantTransaction`). No expone
contenido clínico: la tabla `patients` no almacena notas médicas (ver módulo
`medical-notes`).

## Endpoints

- `GET /api/patients` — lista paginada (`page`, `pageSize`, `search`, `status`).
- `GET /api/patients/:patientId` — detalle.

Roles permitidos: admin, direccion, recepcion, coordinador, medico, terapeuta,
personal_acompanamiento.

## Estructura esperada al implementar

patients/
├── patients.routes.ts
├── patients.controller.ts
├── patients.service.ts
├── patients.repository.ts
├── patients.validation.ts
├── patients.constants.ts
└── README.md

## Responsabilidades por archivo

- routes.ts: definición de endpoints.
- controller.ts: entrada HTTP, request y response.
- service.ts: reglas de negocio.
- repository.ts: acceso a PostgreSQL usando pg.
- validation.ts: validación de payloads.
- constants.ts: estados, enums y constantes del módulo.
