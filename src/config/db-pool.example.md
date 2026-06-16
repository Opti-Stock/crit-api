# PostgreSQL Pool Example

Cuando se implemente la conexión real, se espera una configuración parecida a:

```ts
import { Pool } from "pg";
import { env } from "./env";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on("connect", () => {
  console.log("Nueva conexión a PostgreSQL establecida");
});

pool.on("error", (error) => {
  console.error("Error inesperado en PostgreSQL pool:", error);
});

export default pool;
```

Este archivo es solo documentación. No contiene código funcional activo.
