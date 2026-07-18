import type { Express } from "express";
import type { Pool } from "pg";

export function registerHealthEndpoints(app: Express, service: string, pool: Pool): void {
  app.get("/health", (_request, response) => response.status(200).json({ status: "ok", service }));
  app.get("/health/live", (_request, response) => response.status(200).json({ status: "ok", service }));
  app.get("/health/ready", async (_request, response) => {
    try {
      await pool.query("SELECT 1");
      response.status(200).json({ status: "ready", service });
    } catch {
      response.status(503).json({ status: "unavailable", service });
    }
  });
}
