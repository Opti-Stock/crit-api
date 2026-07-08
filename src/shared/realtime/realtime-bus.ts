import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export type RealtimeEventType =
  | "appointment_changed"
  | "attendance_changed"
  | "reception_checkin_registered"
  | "handoff_note_created"
  | "handoff_note_read"
  | "notification_created"
  | "notification_read";

export interface RealtimeEvent<TData = unknown> {
  id: string;
  type: RealtimeEventType;
  tenantId: string;
  userId?: string;
  occurredAt: string;
  data: TData;
}

type RealtimeListener = (event: RealtimeEvent) => void;

class RealtimeBus {
  private readonly emitter = new EventEmitter();

  publish<TData>(
    event: Omit<RealtimeEvent<TData>, "id" | "occurredAt">
  ): RealtimeEvent<TData> {
    const payload: RealtimeEvent<TData> = {
      ...event,
      id: randomUUID(),
      occurredAt: new Date().toISOString()
    };

    this.emitter.emit("event", payload);
    return payload;
  }

  subscribe(listener: RealtimeListener): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}

export const realtimeBus = new RealtimeBus();
