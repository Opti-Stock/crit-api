# Módulo: appointments

Este módulo pertenece a crit-api.

## Propósito

Creación, reagendado y listado de citas, montado en main-api
(`/api/appointments`).
La FK compuesta `(tenant_id, collaborator_id, clinic_id)` en `crit-db` exige
que el colaborador ya tenga membresía en esa clínica (`collaborator_clinics`);
la FK de `room_id` exige que el cuarto pertenezca a esa misma clínica. El
El módulo `scheduling` genera recomendaciones; este módulo vuelve a validar sus
restricciones al guardar.

## Visibilidad por rol

- `admin`, `direccion`: todas las citas del tenant.
- `recepcion`, `coordinador`: citas de las clínicas en `user_clinic_access`.
- `medico`, `terapeuta`: solo citas donde son el colaborador asignado.

Los alcances de varios roles se combinan. Por ejemplo, un usuario `medico` y
`coordinador` ve sus citas propias más las citas de sus clínicas autorizadas.
El detalle aplica el mismo alcance que el listado. Recepción y coordinación solo
pueden crear citas dentro de `user_clinic_access`.

## Endpoints

- `GET /api/appointments` — lista paginada (`page`, `pageSize`, `from`, `to`,
  `status`, `clinicId`, `patientId`, `collaboratorId`), filtrada según el rol.
- `GET /api/appointments/:appointmentId` — detalle.
- `POST /api/appointments` — crea una cita. Roles: admin, direccion,
  recepcion, coordinador.
- `PATCH /api/appointments/:appointmentId` — actualiza o reagenda una cita.
- `POST /api/appointments/recommendations` — recomienda horarios disponibles
  con puntuación y razones.

La escritura toma bloqueos asesores ordenados para paciente, colaborador y sala.
Los horarios manuales deben cumplir las mismas compatibilidades, duración,
buffers, horarios, disponibilidad y bloqueos que una recomendación. Cuando una
opción recomendada deja de estar disponible se devuelve
`APPOINTMENT_RECOMMENDATION_STALE`.

## Estructura esperada al implementar

appointments/
├── appointments.routes.ts
├── appointments.controller.ts
├── appointments.service.ts
├── appointments.repository.ts
├── appointments.validation.ts
├── appointments.constants.ts
└── README.md

## Responsabilidades por archivo

- routes.ts: definición de endpoints.
- controller.ts: entrada HTTP, request y response.
- service.ts: reglas de negocio.
- repository.ts: acceso a PostgreSQL usando pg.
- validation.ts: validación de payloads.
- constants.ts: estados, enums y constantes del módulo.
