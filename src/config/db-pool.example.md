# PostgreSQL Pool

`src/config/db.ts` exporta un único `Pool` configurado por `DATABASE_URL`. La URL debe usar el rol `crit_app`, nunca el propietario de migraciones.

Importar el pool no abre una conexión. `npm run db:check` valida conectividad y que exista la baseline de `crit-db`.

Los repositorios que consultan datos tenant-scoped deben adquirir un `PoolClient`, abrir una transacción, ejecutar:

```sql
SELECT set_config('app.current_tenant_id', $1, true);
SELECT set_config('app.current_user_id', $1, true);
```

y conservar el mismo cliente hasta `COMMIT`/`ROLLBACK`. El valor local a transacción evita filtrar identidad entre requests al reutilizar conexiones.
