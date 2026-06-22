import assert from "node:assert/strict";
import { test } from "node:test";

import { CritPostApiClient, ExternalApiError } from "./crit-post-api.client.js";

test("client sends bearer authentication and idempotency key", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const request: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(null, { status: 204 });
  };
  const client = new CritPostApiClient(
    { url: "https://example.test/events", token: "secret-token", requestTimeoutMs: 1_000 },
    request
  );

  await client.send("event-1", { schemaVersion: 1 });

  assert.equal(requestUrl, "https://example.test/events");
  assert.equal(new Headers(requestInit?.headers).get("authorization"), "Bearer secret-token");
  assert.equal(new Headers(requestInit?.headers).get("idempotency-key"), "event-1");
  assert.equal(requestInit?.body, JSON.stringify({ schemaVersion: 1 }));
});

test("client exposes only an HTTP status for non-success responses", async () => {
  const client = new CritPostApiClient(
    { url: "https://example.test/events", token: "secret-token", requestTimeoutMs: 1_000 },
    async () => new Response("sensitive response", { status: 503 })
  );

  await assert.rejects(
    () => client.send("event-1", {}),
    (error: unknown) => error instanceof ExternalApiError && error.statusCode === 503
  );
});

test("client sanitizes transport failures", async () => {
  const client = new CritPostApiClient(
    { url: "https://example.test/token-in-url", token: "secret-token", requestTimeoutMs: 1_000 },
    async () => { throw new Error("secret-token at https://example.test/token-in-url"); }
  );

  await assert.rejects(
    () => client.send("event-1", {}),
    (error: unknown) => error instanceof ExternalApiError && error.message === "External API request failed"
  );
});
