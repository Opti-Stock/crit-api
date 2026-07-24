# Scheduling recommendations

`POST /api/appointments/recommendations` returns up to five deterministic,
explainable appointment options. Patient and clinic are required; date,
professional, appointment type and room narrow the search incrementally.

PostgreSQL generates five-minute candidates in the clinic IANA time zone and
applies operating hours, recurring availability, compatibility mappings,
duration, buffers, blocks and existing appointments. The service assigns the
documented 100-point score and stable tie breakers.

Recommendations never reserve a slot. Appointment creation and rescheduling must
revalidate the selected or manually entered slot inside their transaction.

## Configuration

Scheduling configuration is managed as clinic-scoped, atomic collections:

- `GET|PUT /api/scheduling/clinics/:clinicId/operating-hours`
- `GET|PUT /api/scheduling/clinics/:clinicId/appointment-types`
- `GET|PUT /api/scheduling/clinics/:clinicId/collaborators/:collaboratorId/appointment-types`
- `GET|PUT /api/scheduling/clinics/:clinicId/rooms/:roomId/appointment-types`
- `GET|POST /api/scheduling/clinics/:clinicId/blocks`
- `DELETE /api/scheduling/clinics/:clinicId/blocks/:blockId`
- `GET|PUT /api/scheduling/clinics/:clinicId/patients/:patientId/preferences`

`admin` and `coordinador` can manage clinic rules when their tenant and clinic
scope allow it. `recepcion` can read and replace patient preferences only.
Operating hours and preferences reject inverted or overlapping ranges. Bulk
`PUT` operations replace the complete active collection in one transaction.

Times in operating hours and preferences use `HH:mm` in the clinic's IANA time
zone. Scheduling block timestamps use ISO 8601 with an explicit UTC offset.
