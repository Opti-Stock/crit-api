import type { PoolClient } from "pg";

import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { withTenantTransaction } from "../shared/db/tenant-transaction.js";
import type { NoteKind } from "../modules/ai-assistance/ai-assistance.validation.js";

export interface AiJob {
  id: string;
  tenantId: string;
  type: "index_note" | "summarize" | "answer";
  resourceId: string;
  requestedByUserId: string;
  attempts: number;
}

export interface SourceNote {
  id: string;
  patientId: string;
  kind: NoteKind;
  text: string;
  updatedAt: string;
  createdAt: string;
}

export class AiWorkerRepository {
  async heartbeat(
    tenantId: string,
    workerId: string,
    status: "healthy" | "degraded" | "stopping"
  ) {
    return withTenantTransaction({ tenantId }, (client) => client.query(
      `INSERT INTO ai_worker_heartbeats (
         tenant_id, worker_id, status, embedding_model, generation_model
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, worker_id) DO UPDATE
       SET status = EXCLUDED.status,
           embedding_model = EXCLUDED.embedding_model,
           generation_model = EXCLUDED.generation_model,
           last_seen_at = CURRENT_TIMESTAMP`,
      [
        tenantId,
        workerId,
        status,
        `${env.AI_EMBEDDING_MODEL_ID}@${env.AI_EMBEDDING_MODEL_REVISION}`,
        `${env.AI_GENERATION_MODEL_ID}@${env.AI_GENERATION_MODEL_REVISION}`
      ]
    ), pool);
  }

  async claim(tenantId: string, workerId: string): Promise<AiJob | null> {
    return withTenantTransaction({ tenantId }, async (client) => {
      const result = await client.query<{
        id: string; tenant_id: string; job_type: AiJob["type"]; resource_id: string;
        requested_by_user_id: string; attempts: number;
      }>(
        `WITH candidate AS (
           SELECT id FROM ai_jobs
           WHERE tenant_id = $1 AND status = 'queued' AND available_at <= CURRENT_TIMESTAMP
           ORDER BY priority, created_at
           FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE ai_jobs job
         SET status = 'running', locked_at = CURRENT_TIMESTAMP, locked_by = $2,
             attempts = attempts + 1
         FROM candidate
         WHERE job.tenant_id = $1 AND job.id = candidate.id
         RETURNING job.id, job.tenant_id, job.job_type, job.resource_id,
                   job.requested_by_user_id, job.attempts`,
        [tenantId, workerId]
      );
      const row = result.rows[0];
      return row ? {
        id: row.id,
        tenantId: row.tenant_id,
        type: row.job_type,
        resourceId: row.resource_id,
        requestedByUserId: row.requested_by_user_id,
        attempts: row.attempts
      } : null;
    }, pool);
  }

  async complete(job: AiJob) {
    return withTenantTransaction(
      { tenantId: job.tenantId },
      (client) => client.query(
        `UPDATE ai_jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
           locked_at = NULL, locked_by = NULL, error_code = NULL
         WHERE tenant_id = $1 AND id = $2`,
        [job.tenantId, job.id]
      ),
      pool
    );
  }

  async fail(job: AiJob, errorCode: string) {
    return withTenantTransaction(
      { tenantId: job.tenantId, userId: job.requestedByUserId },
      async (client) => {
        await client.query(
          `UPDATE ai_jobs
         SET status = CASE WHEN attempts >= 2 THEN 'failed' ELSE 'queued' END,
           available_at = CASE WHEN attempts >= 2 THEN available_at
             ELSE CURRENT_TIMESTAMP + INTERVAL '1 minute' END,
           locked_at = NULL, locked_by = NULL, error_code = $3,
           completed_at = CASE WHEN attempts >= 2 THEN CURRENT_TIMESTAMP ELSE NULL END
         WHERE tenant_id = $1 AND id = $2`,
          [job.tenantId, job.id, errorCode.slice(0, 100)]
        );
        if (job.attempts >= 2 && job.type === "summarize") {
          await client.query(
            `UPDATE note_summaries SET status = 'failed'
             WHERE tenant_id = $1 AND id = $2`,
            [job.tenantId, job.resourceId]
          );
        }
        if (job.attempts >= 2 && job.type === "answer") {
          await client.query(
            `UPDATE ai_interactions SET status = 'failed'
             WHERE tenant_id = $1 AND id = $2 AND requested_by_user_id = $3`,
            [job.tenantId, job.resourceId, job.requestedByUserId]
          );
        }
      },
      pool
    );
  }

  async loadSourceNote(job: AiJob): Promise<SourceNote | null> {
    return withTenantTransaction(
      { tenantId: job.tenantId, userId: job.requestedByUserId },
      async (client) => {
        const medical = await client.query<{
          id: string; patient_id: string; content: Record<string, unknown>;
          updated_at: string; created_at: string;
        }>(
          `SELECT id, patient_id, content, updated_at, created_at
           FROM medical_notes WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [job.tenantId, job.resourceId]
        );
        if (medical.rows[0]) {
          return {
            id: medical.rows[0].id,
            patientId: medical.rows[0].patient_id,
            kind: "medical",
            text: JSON.stringify(medical.rows[0].content),
            updatedAt: medical.rows[0].updated_at,
            createdAt: medical.rows[0].created_at
          };
        }
        const handoff = await client.query<{
          id: string; patient_id: string; title: string; content: string;
          priority: string; status: string; updated_at: string; created_at: string;
        }>(
          `SELECT id, patient_id, title, content, priority, status, updated_at, created_at
           FROM handoff_notes WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [job.tenantId, job.resourceId]
        );
        const row = handoff.rows[0];
        return row ? {
          id: row.id,
          patientId: row.patient_id,
          kind: "handoff",
          text: `title: ${row.title}\npriority: ${row.priority}\nstatus: ${row.status}\ncontent: ${row.content}`,
          updatedAt: row.updated_at,
          createdAt: row.created_at
        } : null;
      },
      pool
    );
  }

  async replaceEmbeddings(
    job: AiJob,
    note: SourceNote,
    model: string,
    chunks: Array<{ index: number; text: string; hash: string; embedding: number[] }>
  ) {
    return withTenantTransaction(
      { tenantId: job.tenantId, userId: job.requestedByUserId },
      async (client) => {
        const sourceColumn = note.kind === "medical" ? "medical_note_id" : "handoff_note_id";
        await client.query(
          `DELETE FROM note_embedding_chunks
           WHERE tenant_id = $1 AND ${sourceColumn} = $2 AND embedding_model = $3`,
          [job.tenantId, note.id, model]
        );
        for (const chunk of chunks) {
          await client.query(
            `INSERT INTO note_embedding_chunks (
               tenant_id, patient_id, note_kind, ${sourceColumn}, chunk_index,
               content_excerpt, content_hash, embedding_model, embedding, source_updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, $10)`,
            [
              job.tenantId, note.patientId, note.kind, note.id, chunk.index,
              chunk.text, chunk.hash, model, vectorLiteral(chunk.embedding), note.updatedAt
            ]
          );
        }
      },
      pool
    );
  }

  async removeEmbeddingsBySourceId(job: AiJob) {
    return this.withActor(job, (client) => client.query(
      `DELETE FROM note_embedding_chunks
       WHERE tenant_id = $1 AND (medical_note_id = $2 OR handoff_note_id = $2)`,
      [job.tenantId, job.resourceId]
    ));
  }

  async withActor<T>(job: AiJob, operation: (client: PoolClient) => Promise<T>) {
    return withTenantTransaction(
      { tenantId: job.tenantId, userId: job.requestedByUserId },
      operation,
      pool
    );
  }
}

export function vectorLiteral(values: number[]) {
  return `[${values.map((value) => Number(value).toFixed(8)).join(",")}]`;
}
