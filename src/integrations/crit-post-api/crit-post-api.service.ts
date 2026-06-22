import type { OutboxEvent, ProcessingSummary } from "./crit-post-api.types.js";

export interface WorkerOptions {
  batchSize: number;
  maxRetries: number;
  processingTimeoutMs: number;
}

export interface OutboxRepository {
  listActiveTenantIds(): Promise<string[]>;
  recoverStale(tenantId: string, processingTimeoutMs: number): Promise<number>;
  claim(tenantId: string, batchSize: number, maxRetries: number): Promise<OutboxEvent[]>;
  markSent(tenantId: string, eventId: string): Promise<void>;
  markFailed(tenantId: string, eventId: string, error: string): Promise<void>;
}

export interface OutboxClient {
  send(eventId: string, payload: Record<string, unknown>): Promise<void>;
}

export class CritPostApiService {
  constructor(
    private readonly repository: OutboxRepository,
    private readonly client: OutboxClient,
    private readonly options: WorkerOptions
  ) {}

  async processOnce(): Promise<ProcessingSummary> {
    const summary: ProcessingSummary = { claimed: 0, sent: 0, failed: 0, recovered: 0 };
    const tenantIds = await this.repository.listActiveTenantIds();

    for (const tenantId of tenantIds) {
      summary.recovered += await this.repository.recoverStale(
        tenantId,
        this.options.processingTimeoutMs
      );
      const events = await this.repository.claim(
        tenantId,
        this.options.batchSize,
        this.options.maxRetries
      );
      summary.claimed += events.length;

      for (const event of events) {
        try {
          await this.client.send(event.id, event.payload);
          await this.repository.markSent(event.tenantId, event.id);
          summary.sent += 1;
        } catch (error) {
          await this.repository.markFailed(event.tenantId, event.id, sanitizeError(error));
          summary.failed += 1;
        }
      }
    }

    return summary;
  }
}

export function sanitizeError(error: unknown): string {
  if (
    error instanceof Error &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return `External API returned HTTP ${error.statusCode}`;
  }
  return "External API request failed";
}
