# Integración con PostgreSQL y API CRIT

`crit-db` es la única fuente de verdad del esquema y las migraciones. `crit-api` usa el rol no propietario `crit_app` mediante `DATABASE_URL`; no crea tablas ni ejecuta DDL al iniciar.

## Conexión local

API en host y base en Docker:

```env
DATABASE_URL=postgresql://crit_app:crit_app@localhost:5432/crit_db
```

API y base en la misma red Docker:

```env
DATABASE_URL=postgresql://crit_app:crit_app@crit-db:5432/crit_db
```

Verificar con `npm run db:check`. El comando ejecuta `SELECT 1` y comprueba que exista `public.tenants`; no imprime la URL ni credenciales.

## Contexto tenant

El login recibirá `{ tenantCode, email, password }`. Primero resuelve un tenant activo por código y después consulta el usuario dentro de una transacción tenant-scoped. El JWT conserva `userId`, `tenantId` y roles.

Cada repositorio debe:

1. Tomar un `PoolClient`.
2. Ejecutar `BEGIN`.
3. Establecer `app.current_tenant_id` y `app.current_user_id` con `set_config(..., true)`.
4. Ejecutar SQL parametrizado con un filtro explícito `tenant_id`.
5. Ejecutar `COMMIT` o `ROLLBACK` y liberar el mismo cliente.

No usar `SET` persistente sobre el pool. RLS protege todos los tenants y `medical_notes` exige además rol `medico` o `terapeuta`.

El contrato completo de tablas, estados y errores vive en `crit-db/docs/crit-api-handoff.md`.

## POST temporal hacia la API CRIT

La escritura de negocio y `crit_api_outbox` se guardan en la misma transacción. Un worker procesa por tenant, reclama filas con `FOR UPDATE SKIP LOCKED` y cambia `pending|failed → processing → sent|failed`.

La falla externa no revierte el flujo clínico. URL y token salen del entorno; payloads, errores y logs no deben incluir secretos ni contenido clínico innecesario.
