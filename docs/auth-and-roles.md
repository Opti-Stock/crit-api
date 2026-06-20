# Auth y roles

## Login futuro

```json
{
  "tenantCode": "CRIT-OCC-01",
  "email": "usuario@crit.org",
  "password": "..."
}
```

El email se normaliza a minúsculas. El tenant se resuelve antes de consultar `users`; el email solo es único dentro de cada tenant. El contexto autenticado/JWT contiene `userId`, `tenantId` y roles.

## Roles iniciales

- `admin`
- `direccion`
- `recepcion`
- `coordinador`
- `medico`
- `terapeuta`
- `personal_acompanamiento`
- `paciente_familia` (reservado, no asignado en el MVP)

## Reglas

- Dirección y admin gestionan usuarios, roles y configuración, pero no reciben acceso clínico automático.
- Recepción registra y consulta asistencia operativa; nunca selecciona contenido de `medical_notes`.
- Médicos y terapeutas registran asistencia y notas médicas bajo RLS clínico.
- Coordinadores gestionan calendario y citas de sus clínicas.
- Personal de acompañamiento crea notas de enlace cuando está autorizado.
- Todas las decisiones combinan `tenantId`, rol, acceso a clínica y propiedad del recurso cuando corresponda.
