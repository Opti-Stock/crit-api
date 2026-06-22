import assert from "node:assert/strict";
import { test } from "node:test";

import { ExternalApiError } from "./crit-post-api.client.js";
import {
  CritPostApiService,
  sanitizeError,
  type OutboxClient,
  type OutboxRepository
} from "./crit-post-api.service.js";
import type { OutboxEvent } from "./crit-post-api.types.js";

class FakeRepository implements OutboxRepository {
  sent: string[] = [];
  failed: { id: string; error: string }[] = [];
  events: OutboxEvent[] = [];

  async listActiveTenantIds() { return ["tenant-1"]; }
  async recoverStale() { return 1; }
  async claim() { return this.events; }
  async markSent(_tenantId: string, eventId: string) { this.sent.push(eventId); }
  async markFailed(_tenantId: string, eventId: string, error: string) {
    this.failed.push({ id: eventId, error });
  }
}

test("worker marks successful and failed sends without aborting its batch", async () => {
  const repository = new FakeRepository();
  repository.events = [
    { id: "event-1", tenantId: "tenant-1", payload: {}, retryCount: 1 },
    { id: "event-2", tenantId: "tenant-1", payload: {}, retryCount: 1 }
  ];
  const client: OutboxClient = {
    async send(eventId) {
      if (eventId === "event-2") throw new ExternalApiError(503);
    }
  };
  const service = new CritPostApiService(repository, client, {
    batchSize: 10,
    maxRetries: 5,
    processingTimeoutMs: 60_000
  });

  const summary = await service.processOnce();

  assert.deepEqual(summary, { claimed: 2, sent: 1, failed: 1, recovered: 1 });
  assert.deepEqual(repository.sent, ["event-1"]);
  assert.deepEqual(repository.failed, [
    { id: "event-2", error: "External API returned HTTP 503" }
  ]);
});

test("unknown errors never expose their message", () => {
  assert.equal(sanitizeError(new Error("token and patient data")), "External API request failed");
});
