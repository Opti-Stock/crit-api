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
