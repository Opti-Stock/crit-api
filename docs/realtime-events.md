# Eventos en tiempo real

## Estado MVP

El backend expone SSE autenticado mediante la misma cookie HttpOnly de la sesión operativa.

## Endpoint propuesto

```txt
GET /api/realtime/events
Cookie: crit_session=<HttpOnly>
```

## Reglas de autorizacion

- El backend calcula el alcance por rol y tenant; el cliente no manda `tenantId`, `clinicId` ni `collaboratorId` como fuente de autorizacion.
- `admin` y `direccion` reciben eventos del tenant.
- `recepcion` y `coordinador` reciben eventos de sus clinicas en `user_clinic_access`.
- `medico` y `terapeuta` reciben eventos de sus citas como colaborador.
- `personal_acompanamiento` recibe solo eventos donde participa como destinatario o autor.

## Eventos

```json
{
  "type": "appointment_changed",
  "id": "uuid",
  "occurredAt": "2026-07-08T00:00:00.000Z",
  "data": {
    "appointmentId": "uuid",
    "patientId": "uuid",
    "clinicId": "uuid",
    "collaboratorId": "uuid"
  }
}
```

Tipos iniciales:

- `appointment_changed`
- `attendance_changed`
- `reception_checkin_registered`
- `handoff_note_created`
- `handoff_note_read`
- `notification_created`
- `notification_read`

## Pendiente tecnico

Implementar una tabla outbox interna o un broker simple para fan-out en memoria por instancia. En nube con multiples replicas, usar Postgres `LISTEN/NOTIFY`, Redis Pub/Sub o un servicio administrado equivalente.
