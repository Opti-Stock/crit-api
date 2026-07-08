# Soft delete y restauracion administrativa

## Alcance

Admin API soporta borrado logico y restauracion para:

- `DELETE /admin/users/:userId`
- `POST /admin/users/:userId/restore`
- `DELETE /admin/clinics/:id`
- `POST /admin/clinics/:id/restore`
- `DELETE /admin/rooms/:id`
- `POST /admin/rooms/:id/restore`

Los listados de usuarios, clinicas y consultorios ocultan registros eliminados por default. Para auditoria operacional:

```txt
GET /admin/users?includeDeleted=true
GET /admin/clinics?includeDeleted=true
GET /admin/rooms?includeDeleted=true
```

## Reglas

- Borrar usuario marca `users.status = inactive` y `users.deleted_at`.
- Borrar usuario elimina su `user_clinic_access` y marca su `collaborators` asociado como inactivo/eliminado.
- No se permite borrar o desactivar el ultimo admin activo del tenant.
- Restaurar usuario reactiva `users` y vuelve a sincronizar `collaborators`.
- Restaurar usuario no restaura automaticamente `user_clinic_access`; el admin debe reasignar clinicas para evitar revivir permisos antiguos sin revision.
- Borrar clinica marca `clinics` como inactiva/eliminada y tambien marca sus `rooms` como inactivos/eliminados.
- Restaurar clinica no restaura automaticamente sus consultorios; cada room se restaura de forma explicita.
- Restaurar room solo funciona si su clinica no esta eliminada.

## Auditoria

Los triggers de `audit_logs` registran `INSERT`, `UPDATE` y `DELETE` con:

- usuario actor,
- entidad,
- id de entidad,
- campos modificados,
- fecha.

La consulta administrativa es:

```txt
GET /admin/audit-logs?page=1&pageSize=20
GET /admin/audit-logs?entityType=users&entityId=<uuid>
```

No se guardan valores sensibles ni contenido clinico en `audit_logs.metadata`.
