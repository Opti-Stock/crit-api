# PostgreSQL Pool

La conexión reutilizable está implementada en:

```txt
src/config/db.ts
```

Usa `DATABASE_URL`, limita el número de conexiones y configura tiempos de espera de conexión e inactividad. La configuración de entorno se valida en `src/config/env.ts` y no imprime secretos.
