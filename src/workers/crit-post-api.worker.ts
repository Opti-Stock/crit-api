import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { CritPostApiClient } from "../integrations/crit-post-api/crit-post-api.client.js";
import { CritPostApiRepository } from "../integrations/crit-post-api/crit-post-api.repository.js";
import { CritPostApiService } from "../integrations/crit-post-api/crit-post-api.service.js";

const runOnce = process.argv.includes("--once");
let stopping = false;

async function main() {
  if (!env.CRIT_POST_API_URL || !env.CRIT_POST_API_TOKEN) {
    throw new Error("CRIT POST API URL and token are required to start the worker");
  }

  const service = new CritPostApiService(
    new CritPostApiRepository(pool),
    new CritPostApiClient({
      url: env.CRIT_POST_API_URL,
      token: env.CRIT_POST_API_TOKEN,
      requestTimeoutMs: env.CRIT_POST_API_REQUEST_TIMEOUT_MS
    }),
    {
      batchSize: env.CRIT_POST_API_BATCH_SIZE,
      maxRetries: env.CRIT_POST_API_MAX_RETRIES,
      processingTimeoutMs: env.CRIT_POST_API_PROCESSING_TIMEOUT_MS
    }
  );

  do {
    const summary = await service.processOnce();
    console.log("CRIT POST API worker cycle completed", summary);
    if (!runOnce && !stopping) await delay(env.CRIT_POST_API_POLL_INTERVAL_MS);
  } while (!runOnce && !stopping);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stop() {
  stopping = true;
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

main()
  .catch((error: unknown) => {
    console.error("CRIT POST API worker failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error"
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
