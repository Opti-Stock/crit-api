# Pendientes y sugerencias CRIT Assist

## Implementado en el ciclo actual

- Dockerfile multi-stage y `docker-compose.yml` para levantar main API, admin API, check-in API y super-admin API con una sola imagen.
- Soft delete y restauracion para usuarios, clinicas y consultorios.
- Consulta administrativa de `audit_logs`.
- Documentacion de despliegue Docker/Render, soft delete/restauracion y contrato recomendado de eventos en tiempo real.
- Pruebas de contrato para validacion de `includeDeleted`, auditoria y UUIDs de usuario.
- UI admin con mostrar/ocultar eliminados, restaurar y confirmacion inline para acciones destructivas.
- Base de paginacion y filtros de alcance ya aplicada en modulos operativos principales.
- Motivo opcional para soft delete/restauracion de usuarios, clinicas y consultorios, registrado en `audit_logs.metadata`.
- SSE autenticado en `GET /api/realtime/events` con eventos de notificaciones creadas/leidas.
- Front conectado al SSE autenticado mediante `fetch` streaming con Bearer token.
- Matriz centralizada de permisos de frontend.
- Combobox compartido de pacientes aplicado a asistencias y notas de enlace.
- Badges de alcance para coordinador en asistencias.
- Prueba de notificaciones con fixture para asegurar metadata de paciente.
- Test de integracion Postgres para create/delete/restore de clinicas, activable con `CRIT_DB_INTEGRATION=1`.
- Smoke E2E browser de front, activable con `CRIT_E2E_BROWSER=1` y Playwright instalado.

## Funcionales

- Ampliar el smoke E2E browser para ejecutar login real y flujo completo: super admin, admin, calendario, check-in, asistencia, nota medica, nota de enlace y notificaciones.
- Migrar cualquier listado operativo futuro a paginacion server-side desde el primer contrato.
- Decidir si el motivo de soft delete/restauracion debe pasar de opcional a obligatorio por politica de auditoria.
- Extender el combobox compartido al calendario cuando se haga una refactorizacion completa de esa pantalla.

## Visuales y UX

- Revisar textos restantes para mover ayuda tecnica a tooltips o documentacion.
- Mejorar estados vacios con acciones claras en pantallas que aun no tienen CTA contextual.
- Extender el patron de botones destructivos con motivo inline a modulos futuros.
- Mejorar legibilidad de tablas admin con acciones fijas al final.

## Tecnicos

- Generar/validar automaticamente la matriz de permisos de front contra docs backend.
- Ampliar tests de integracion Postgres para usuarios y consultorios.
- Publicar por SSE los eventos `appointment_changed`, `attendance_changed`, `reception_checkin_registered`, `handoff_note_created` y `handoff_note_read`.
