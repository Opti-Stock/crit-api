import { randomUUID } from "node:crypto";

import { createAiModelRuntime } from "../ai/model-runtime.js";
import { env } from "../config/env.js";
import { AiWorkerProcessor } from "./ai-worker.processor.js";
import { AiWorkerRepository } from "./ai-worker.repository.js";

if (!env.AI_ENABLED) {
  process.stdout.write(`${JSON.stringify({ level: "info", event: "ai_worker_disabled" })}\n`);
  process.exit(0);
}

const tenantIds = env.AI_WORKER_TENANT_IDS
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const workerId = `ai-${randomUUID()}`;
const repository = new AiWorkerRepository();
const processor = new AiWorkerProcessor(repository, createAiModelRuntime());
const once = process.argv.includes("--once");
let stopping = false;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

do {
  let processed = false;
  for (const tenantId of tenantIds) {
    await repository.heartbeat(tenantId, workerId, "healthy");
    const job = await repository.claim(tenantId, workerId);
    if (!job) continue;
    processed = true;
    const startedAt = Date.now();
    try {
      await processor.process(job);
      await repository.complete(job);
      process.stdout.write(`${JSON.stringify({
        level: "info",
        event: "ai_job_completed",
        jobId: job.id,
        jobType: job.type,
        durationMs: Date.now() - startedAt
      })}\n`);
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : "AI_JOB_FAILED";
      await repository.fail(job, errorCode);
      process.stderr.write(`${JSON.stringify({
        level: "error",
        event: "ai_job_failed",
        jobId: job.id,
        jobType: job.type,
        durationMs: Date.now() - startedAt,
        errorCode: sanitizeErrorCode(errorCode)
      })}\n`);
    }
  }
  if (!once && !processed && !stopping) {
    await new Promise((resolve) => setTimeout(resolve, env.AI_POLL_INTERVAL_MS));
  }
} while (!once && !stopping);

for (const tenantId of tenantIds) {
  await repository.heartbeat(tenantId, workerId, "stopping");
}

function sanitizeErrorCode(value: string) {
  return /^[A-Z0-9_]+$/.test(value) ? value.slice(0, 100) : "AI_JOB_FAILED";
}
