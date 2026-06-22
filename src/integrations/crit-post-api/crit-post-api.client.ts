export interface CritPostApiClientConfig {
  url: string;
  token: string;
  requestTimeoutMs: number;
}

export class ExternalApiError extends Error {
  constructor(public readonly statusCode?: number) {
    super(statusCode ? `External API returned HTTP ${statusCode}` : "External API request failed");
    this.name = "ExternalApiError";
  }
}

export class CritPostApiClient {
  constructor(
    private readonly config: CritPostApiClientConfig,
    private readonly request: typeof fetch = fetch
  ) {}

  async send(eventId: string, payload: Record<string, unknown>): Promise<void> {
    let response: Response;
    try {
      response = await this.request(this.config.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.token}`,
          "content-type": "application/json",
          "idempotency-key": eventId
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs)
      });
    } catch {
      throw new ExternalApiError();
    }

    if (!response.ok) throw new ExternalApiError(response.status);
  }
}
