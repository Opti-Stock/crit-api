import { Pool } from "pg";

import { env } from "./env.js";

export const platformPool = new Pool({
  connectionString: env.PLATFORM_DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

platformPool.on("error", (error) => {
  const code = (error as NodeJS.ErrnoException).code;
  console.error("Unexpected PostgreSQL platform pool error", {
    name: error.name,
    message: error.message,
    code
  });
});

export default platformPool;
