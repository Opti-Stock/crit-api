import { createHash } from "node:crypto";
import type { Pool } from "pg";

import { pool } from "../../config/db.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import { NotFoundError } from "../../shared/errors/app-error.js";
import type {
  FeedbackInput,
  ListInteractionsInput,
  NoteKind
} from "./ai-assistance.validation.js";

export interface NoteSummaryRecord {
  id: string;
  patientId: string;
  kind: NoteKind;
  status: "queued" | "running" | "completed" | "failed" | "stale";
  content: Record<string, unknown> | null;
  sourceHash: string;
  model: string | null;
  generatedAt: string | null;
  staleAt: string | null;
  createdAt: string;
  sources: Array<{ noteId: string; createdAt: string }>;
}

export interface AiInteractionRecord {
  id: string;
  patientId: string;
  kind: NoteKind;
  question: string;
  status: "queued" | "running" | "supported" | "insufficient_information" | "failed";
  answer: string | null;
  model: string | null;
  generatedAt: string | null;
  createdAt: string;
  feedback: { rating: string; reason: string | null } | null;
  sources: Array<{
    noteId: string;
    createdAt: string;
    excerpt: string;
    rank: number;
    score: number;
  }>;
}

export class AiAssistanceRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async requestSummary(
    tenantId: string,
    actorId: string,
    patientId: string,
    kind: NoteKind
  ): Promise<{ summary: NoteSummaryRecord; created: boolean }> {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      await assertPatientExists(client, tenantId, patientId);
      const sourceRows = await client.query<{ id: string; updated_at: string }>(
        kind === "medical"
          ? `SELECT id, updated_at FROM medical_notes
             WHERE tenant_id = $1 AND patient_id = $2 AND deleted_at IS NULL
             ORDER BY created_at, id`
          : `SELECT id, updated_at FROM handoff_notes
             WHERE tenant_id = $1 AND patient_id = $2 AND deleted_at IS NULL
             ORDER BY created_at, id`,
        [tenantId, patientId]
      );
      const sourceHash = createHash("sha256")
        .update(sourceRows.rows.map((row) => `${row.id}:${row.updated_at}`).join("|"))
        .digest("hex");
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM note_summaries
         WHERE tenant_id = $1 AND patient_id = $2 AND note_kind = $3
           AND source_hash = $4 AND status IN ('queued', 'running', 'completed')
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId, patientId, kind, sourceHash]
      );
      let summaryId = existing.rows[0]?.id;
      let created = false;
      if (!summaryId) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO note_summaries (
             tenant_id, patient_id, note_kind, source_hash, prompt_version,
             requested_by_user_id
           ) VALUES ($1, $2, $3, $4, 'summary-v1', $5)
           RETURNING id`,
          [tenantId, patientId, kind, sourceHash, actorId]
        );
        summaryId = inserted.rows[0]!.id;
        await client.query(
          `INSERT INTO ai_jobs (
             tenant_id, job_type, resource_id, requested_by_user_id, priority
           ) VALUES ($1, 'summarize', $2, $3, 30)`,
          [tenantId, summaryId, actorId]
        );
        created = true;
      }
      return {
        summary: (await findSummary(client, tenantId, summaryId))!,
        created
      };
    }, this.databasePool);
  }

  async findLatestSummary(
    tenantId: string,
    actorId: string,
    patientId: string,
    kind: NoteKind
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM note_summaries
         WHERE tenant_id = $1 AND patient_id = $2 AND note_kind = $3
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId, patientId, kind]
      );
      return result.rows[0] ? findSummary(client, tenantId, result.rows[0].id) : null;
    }, this.databasePool);
  }

  async findSummary(tenantId: string, actorId: string, summaryId: string) {
    return withTenantTransaction(
      { tenantId, userId: actorId },
      (client) => findSummary(client, tenantId, summaryId),
      this.databasePool
    );
  }

  async createInteraction(
    tenantId: string,
    actorId: string,
    patientId: string,
    kind: NoteKind,
    question: string,
    retentionDays: number
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      await assertPatientExists(client, tenantId, patientId);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO ai_interactions (
           tenant_id, patient_id, note_kind, requested_by_user_id, question,
           prompt_version, expires_at
         ) VALUES ($1, $2, $3, $4, $5, 'rag-v1',
           CURRENT_TIMESTAMP + make_interval(days => $6))
         RETURNING id`,
        [tenantId, patientId, kind, actorId, question, retentionDays]
      );
      const interactionId = inserted.rows[0]!.id;
      await client.query(
        `INSERT INTO ai_jobs (
           tenant_id, job_type, resource_id, requested_by_user_id, priority
         ) VALUES ($1, 'answer', $2, $3, 20)`,
        [tenantId, interactionId, actorId]
      );
      return (await findInteraction(client, tenantId, interactionId))!;
    }, this.databasePool);
  }

  async findInteraction(tenantId: string, actorId: string, interactionId: string) {
    return withTenantTransaction(
      { tenantId, userId: actorId },
      (client) => findInteraction(client, tenantId, interactionId),
      this.databasePool
    );
  }

  async listInteractions(
    tenantId: string,
    actorId: string,
    patientId: string,
    input: ListInteractionsInput
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ai_interactions
         WHERE tenant_id = $1 AND patient_id = $2 AND note_kind = $3
           AND requested_by_user_id = $4 AND expires_at > CURRENT_TIMESTAMP`,
        [tenantId, patientId, input.kind, actorId]
      );
      const ids = await client.query<{ id: string }>(
        `SELECT id FROM ai_interactions
         WHERE tenant_id = $1 AND patient_id = $2 AND note_kind = $3
           AND requested_by_user_id = $4 AND expires_at > CURRENT_TIMESTAMP
         ORDER BY created_at DESC LIMIT $5 OFFSET $6`,
        [
          tenantId,
          patientId,
          input.kind,
          actorId,
          input.pageSize,
          (input.page - 1) * input.pageSize
        ]
      );
      const interactions = await Promise.all(
        ids.rows.map((row) => findInteraction(client, tenantId, row.id))
      );
      return {
        interactions: interactions.filter((value): value is AiInteractionRecord => Boolean(value)),
        total: Number(count.rows[0]?.count ?? 0)
      };
    }, this.databasePool);
  }

  async setFeedback(
    tenantId: string,
    actorId: string,
    interactionId: string,
    input: FeedbackInput
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const updated = await client.query(
        `UPDATE ai_interactions
         SET feedback_rating = $4, feedback_reason = $5
         WHERE tenant_id = $1 AND id = $2 AND requested_by_user_id = $3
           AND status IN ('supported', 'insufficient_information')`,
        [tenantId, interactionId, actorId, input.rating, input.reason ?? null]
      );
      if (updated.rowCount === 0) {
        throw new NotFoundError("AI interaction not found", "AI_INTERACTION_NOT_FOUND");
      }
      return (await findInteraction(client, tenantId, interactionId))!;
    }, this.databasePool);
  }
}

async function assertPatientExists(
  client: import("pg").PoolClient,
  tenantId: string,
  patientId: string
) {
  const patient = await client.query(
    `SELECT 1 FROM patients WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [tenantId, patientId]
  );
  if (patient.rowCount === 0) {
    throw new NotFoundError("Patient not found", "PATIENT_NOT_FOUND");
  }
}

async function findSummary(
  client: import("pg").PoolClient,
  tenantId: string,
  summaryId: string
): Promise<NoteSummaryRecord | null> {
  const result = await client.query<{
    id: string; patient_id: string; note_kind: NoteKind; status: NoteSummaryRecord["status"];
    content: Record<string, unknown> | null; source_hash: string; model_id: string | null;
    generated_at: string | null; stale_at: string | null; created_at: string;
    sources: Array<{ noteId: string; createdAt: string }>;
  }>(
    `SELECT summary.id, summary.patient_id, summary.note_kind, summary.status,
       summary.content, summary.source_hash, summary.model_id, summary.generated_at,
       summary.stale_at, summary.created_at,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'noteId', COALESCE(source.medical_note_id, source.handoff_note_id),
           'createdAt', COALESCE(medical.created_at, handoff.created_at)
         ) ORDER BY COALESCE(medical.created_at, handoff.created_at))
         FROM note_summary_sources source
         LEFT JOIN medical_notes medical
           ON medical.tenant_id = source.tenant_id AND medical.id = source.medical_note_id
         LEFT JOIN handoff_notes handoff
           ON handoff.tenant_id = source.tenant_id AND handoff.id = source.handoff_note_id
         WHERE source.tenant_id = summary.tenant_id AND source.summary_id = summary.id
       ), '[]') AS sources
     FROM note_summaries summary
     WHERE summary.tenant_id = $1 AND summary.id = $2`,
    [tenantId, summaryId]
  );
  const row = result.rows[0];
  return row ? {
    id: row.id,
    patientId: row.patient_id,
    kind: row.note_kind,
    status: row.status,
    content: row.content,
    sourceHash: row.source_hash,
    model: row.model_id,
    generatedAt: row.generated_at,
    staleAt: row.stale_at,
    createdAt: row.created_at,
    sources: row.sources
  } : null;
}

async function findInteraction(
  client: import("pg").PoolClient,
  tenantId: string,
  interactionId: string
): Promise<AiInteractionRecord | null> {
  const result = await client.query<{
    id: string; patient_id: string; note_kind: NoteKind; question: string;
    status: AiInteractionRecord["status"]; answer: string | null; model_id: string | null;
    generated_at: string | null; created_at: string; feedback_rating: string | null;
    feedback_reason: string | null; sources: AiInteractionRecord["sources"];
  }>(
    `SELECT interaction.id, interaction.patient_id, interaction.note_kind,
       interaction.question, interaction.status, interaction.answer,
       interaction.model_id, interaction.generated_at, interaction.created_at,
       interaction.feedback_rating, interaction.feedback_reason,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'noteId', COALESCE(chunk.medical_note_id, chunk.handoff_note_id),
           'createdAt', chunk.source_updated_at,
           'excerpt', left(chunk.content_excerpt, 320),
           'rank', source.rank,
           'score', source.score
         ) ORDER BY source.rank)
         FROM ai_interaction_sources source
         JOIN note_embedding_chunks chunk
           ON chunk.tenant_id = source.tenant_id
          AND chunk.id = source.embedding_chunk_id
         WHERE source.tenant_id = interaction.tenant_id
           AND source.interaction_id = interaction.id
       ), '[]') AS sources
     FROM ai_interactions interaction
     WHERE interaction.tenant_id = $1 AND interaction.id = $2
       AND interaction.expires_at > CURRENT_TIMESTAMP`,
    [tenantId, interactionId]
  );
  const row = result.rows[0];
  return row ? {
    id: row.id,
    patientId: row.patient_id,
    kind: row.note_kind,
    question: row.question,
    status: row.status,
    answer: row.answer,
    model: row.model_id,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    feedback: row.feedback_rating
      ? { rating: row.feedback_rating, reason: row.feedback_reason }
      : null,
    sources: row.sources
  } : null;
}
