# Módulo: collaborators

Este módulo pertenece a crit-api.

## Propósito

Endpoints de solo lectura para colaboradores, montados en main-api
(`/api/collaborators`). Un colaborador puede pertenecer a varias clínicas a
través de `collaborator_clinics`; el detalle expone esa membresía.

## Endpoints

- `GET /api/collaborators` — lista paginada (`page`, `pageSize`, `search`,
  `status`, `clinicId`).
- `GET /api/collaborators/:collaboratorId` — detalle, incluye `clinics`.

Roles permitidos: admin, direccion, recepcion, coordinador, medico, terapeuta,
personal_acompanamiento.

## Estructura esperada al implementar

collaborators/
├── collaborators.routes.ts
├── collaborators.controller.ts
├── collaborators.service.ts
├── collaborators.repository.ts
├── collaborators.validation.ts
├── collaborators.constants.ts
└── README.md

## Responsabilidades por archivo

- routes.ts: definición de endpoints.
- controller.ts: entrada HTTP, request y response.
- service.ts: reglas de negocio.
- repository.ts: acceso a PostgreSQL usando pg.
- validation.ts: validación de payloads.
- constants.ts: estados, enums y constantes del módulo.
