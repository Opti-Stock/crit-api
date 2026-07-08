# Pendientes y sugerencias CRIT Assist

## Implementado en el ciclo actual

- Dockerfile multi-stage y `docker-compose.yml` para levantar main API, admin API, check-in API y super-admin API con una sola imagen.
- Soft delete y restauracion para usuarios, clinicas y consultorios.
- Consulta administrativa de `audit_logs`.
- Documentacion de despliegue Docker/Render, soft delete/restauracion y contrato recomendado de eventos en tiempo real.
- Pruebas de contrato para validacion de `includeDeleted`, auditoria y UUIDs de usuario.
- UI admin con mostrar/ocultar eliminados, restaurar y confirmacion inline para acciones destructivas.
- Base de paginacion y filtros de alcance ya aplicada en modulos operativos principales.

## Funcionales

- Agregar pruebas end-to-end browser para el flujo completo: super admin, admin, calendario, check-in, asistencia, nota medica, nota de enlace y notificaciones.
- Migrar todos los listados operativos a paginacion server-side estricta cuando haya datos productivos de alto volumen.
- Agregar motivo obligatorio/opcional para soft delete y restauracion.
- Mostrar una advertencia visual cuando la capacidad declarada de una clinica no coincida con la suma de consultorios.
- Extraer el combobox de pacientes a un componente compartido real para evitar divergencias futuras.
- Agregar pruebas especificas de notificaciones con fixtures de DB para asegurar que siempre incluyan paciente cuando exista relacion.

## Visuales y UX

- Reducir textos tecnicos visibles para usuarios finales y moverlos a tooltips o ayuda contextual.
- Mejorar estados vacios con acciones claras: crear cita, limpiar filtros o buscar otro paciente.
- Revisar responsive del calendario en pantallas medianas cuando se ocultan filtros o se abre el panel de nueva cita.
- Extender el patron de botones destructivos con confirmacion inline a todos los modulos futuros.
- Agregar badges de rol/alcance para coordinadores: "mio", "equipo" o "area".
- Mejorar legibilidad de tablas admin con acciones fijas al final y confirmaciones menos intrusivas que `window.confirm`.

## Tecnicos

- Centralizar permisos de front en una matriz compartida generada/validada contra docs backend.
- Agregar tests de integracion con Postgres para endpoints admin de create/update/delete/restore.
- Implementar SSE autenticado segun `docs/realtime-events.md`.
