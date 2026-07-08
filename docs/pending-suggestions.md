# Pendientes y sugerencias CRIT Assist

## Funcionales

- Agregar pruebas end-to-end para el flujo completo: super admin, admin, calendario, check-in, asistencia, nota medica, nota de enlace y notificaciones.
- Unificar paginacion server-side en front para asistencias, calendario, notas medicas y notas de enlace, evitando cargar paginas grandes cuando haya volumen real.
- Agregar auditoria visible para soft delete de usuarios, clinicas y consultorios: quien elimino, fecha y motivo opcional.
- Permitir restaurar registros eliminados desde administracion con permisos restringidos.
- Validar en admin que la capacidad de una clinica coincida con la suma de consultorios, o mostrar una advertencia cuando no coincida.
- Agregar filtros de alcance consistentes para coordinador en calendario, asistencias, notas medicas y notas de enlace.
- Completar busqueda global de pacientes con paginacion y debounce reutilizable en todos los modulos.
- Agregar pruebas especificas de notificaciones para asegurar que siempre incluyan paciente cuando exista relacion.

## Visuales y UX

- Reducir textos tecnicos visibles para usuarios finales y moverlos a tooltips o ayuda contextual.
- Mejorar estados vacios con acciones claras: crear cita, limpiar filtros o buscar otro paciente.
- Revisar responsive del calendario en pantallas medianas cuando se ocultan filtros o se abre el panel de nueva cita.
- Estandarizar botones destructivos con color, confirmacion y texto consistente.
- Agregar badges de rol/alcance para coordinadores: "mio", "equipo" o "area".
- Mejorar legibilidad de tablas admin con acciones fijas al final y confirmaciones menos intrusivas que `window.confirm`.

## Tecnicos

- Centralizar permisos de front en una matriz compartida para evitar reglas duplicadas por componente.
- Agregar tests de contrato para endpoints admin de create/update/delete.
- Documentar el comportamiento de soft delete y sus efectos en relaciones como `user_clinic_access`, `collaborator_clinics` y `rooms`.
- Evaluar SSE/WebSocket autenticado para notificaciones, asistencia y notas de enlace.
