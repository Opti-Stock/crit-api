import { Pool } from "pg";

import { env } from "./env.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

pool.on("error", (error) => {
  const code = (error as NodeJS.ErrnoException).code;
  console.error("Unexpected PostgreSQL pool error", {
    name: error.name,
    message: error.message,
    code
  });
});

export default pool;
