import type { RequestHandler } from "express";

import { realtimeBus, type RealtimeEvent } from "../../shared/realtime/realtime-bus.js";

const HEARTBEAT_INTERVAL_MS = 25_000;

export class RealtimeController {
  readonly stream: RequestHandler = (request, response) => {
    const auth = request.auth!;

    response.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no"
    });

    writeEvent(response, "connected", {
      tenantId: auth.tenantId,
      userId: auth.userId,
      connectedAt: new Date().toISOString()
    });

    const unsubscribe = realtimeBus.subscribe((event) => {
      if (!canReceiveEvent(event, auth.tenantId, auth.userId)) return;
      writeEvent(response, event.type, stripPrivateScope(event));
    });

    const heartbeat = setInterval(() => {
      response.write(": heartbeat\n\n");
    }, HEARTBEAT_INTERVAL_MS);

    request.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      response.end();
    });
  };
}

function canReceiveEvent(event: RealtimeEvent, tenantId: string, userId: string): boolean {
  return event.tenantId === tenantId && (!event.userId || event.userId === userId);
}

function stripPrivateScope(event: RealtimeEvent) {
  return {
    id: event.id,
    type: event.type,
    occurredAt: event.occurredAt,
    data: event.data
  };
}

function writeEvent(response: { write: (chunk: string) => void }, eventName: string, data: unknown): void {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}
