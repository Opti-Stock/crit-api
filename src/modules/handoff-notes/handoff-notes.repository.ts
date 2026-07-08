import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import type { OperationalAccessScope } from "../../shared/access/operational-access-scope.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../shared/errors/app-error.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import { insertNotification } from "../notifications/notifications.repository.js";
import type { CreateHandoffNoteInput, ListHandoffNotesInput } from "./handoff-notes.validation.js";

const VALID_RECIPIENT_ROLES = [
  "admin",
  "direccion",
  "recepcion",
  "coordinador",
  "medico",
  "terapeuta",
  "personal_acompanamiento"
];

export interface HandoffNoteRecipient {
  userId: string;
  fullName: string;
  readAt: string | null;
}

export interface HandoffNoteSummary {
  id: string;
  patient: { id: string; fullName: string };
  appointmentId: string | null;
  createdBy: { id: string; fullName: string; role: string | null; area: string | null };
  title: string;
  content: string;
  priority: string;
  status: string;
  recipients: HandoffNoteRecipient[];
  createdAt: string;
}

interface HandoffNoteRow {
  id: string;
  patient_id: string;
  patient_full_name: string;
  appointment_id: string | null;
  created_by_user_id: string;
  created_by_full_name: string;
  created_by_role: string | null;
  created_by_area: string | null;
  title: string;
  content: string;
  priority: string;
  status: string;
  recipients: HandoffNoteRecipient[];
  created_at: string;
}

const SELECT_HANDOFF_NOTE = `
  SELECT hn.id, hn.patient_id, p.full_name AS patient_full_name, hn.appointment_id,
    hn.created_by_user_id, creator.full_name AS created_by_full_name,
    creator_role.name AS created_by_role, creator_collaborator.specialty AS created_by_area,
    hn.title, hn.content, hn.priority, hn.status, hn.created_at,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('userId', u.id, 'fullName', u.full_name, 'readAt', hnr.read_at) ORDER BY u.full_name)
       FROM handoff_note_recipients hnr JOIN users u ON u.tenant_id = hnr.tenant_id AND u.id = hnr.user_id
       WHERE hnr.tenant_id = hn.tenant_id AND hnr.handoff_note_id = hn.id),
      '[]'
    ) AS recipients
  FROM handoff_notes hn
  JOIN patients p ON p.tenant_id = hn.tenant_id AND p.id = hn.patient_id
  JOIN users creator ON creator.tenant_id = hn.tenant_id AND creator.id = hn.created_by_user_id
  LEFT JOIN LATERAL (
    SELECT r.name
    FROM user_roles ur
    JOIN roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
    WHERE ur.tenant_id = creator.tenant_id
      AND ur.user_id = creator.id
      AND r.deleted_at IS NULL
    ORDER BY CASE r.name
      WHEN 'admin' THEN 1
      WHEN 'direccion' THEN 2
      WHEN 'recepcion' THEN 3
      WHEN 'coordinador' THEN 4
      WHEN 'medico' THEN 5
      WHEN 'terapeuta' THEN 6
      WHEN 'personal_acompanamiento' THEN 7
      ELSE 99
    END
    LIMIT 1
  ) creator_role ON TRUE
  LEFT JOIN collaborators creator_collaborator
    ON creator_collaborator.tenant_id = creator.tenant_id
   AND creator_collaborator.user_id = creator.id
   AND creator_collaborator.deleted_at IS NULL
`;

export class HandoffNotesRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async list(
    tenantId: string,
    actorId: string,
    actorRoles: string[],
    input: ListHandoffNotesInput,
    scope: OperationalAccessScope
  ) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const filters = ["hn.tenant_id = $1", "hn.deleted_at IS NULL"];
      const values: unknown[] = [tenantId];
      if (!this.canReadTenantWide(actorRoles)) {
        const hasAccess = await this.appendVisibilityFilter(client, tenantId, actorId, scope, values, filters);
        if (!hasAccess) {
          return { notes: [], total: 0 };
        }
      }

      if (input.status) {
        values.push(input.status);
        filters.push(`hn.status = $${values.length}`);
      }
      if (input.priority) {
        values.push(input.priority);
        filters.push(`hn.priority = $${values.length}`);
      }
      if (input.patientId) {
        values.push(input.patientId);
        filters.push(`hn.patient_id = $${values.length}`);
      }

      const where = filters.join(" AND ");
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM handoff_notes hn WHERE ${where}`,
        values
      );

      values.push(input.pageSize, (input.page - 1) * input.pageSize);
      const rows = await client.query<HandoffNoteRow>(
        `${SELECT_HANDOFF_NOTE}
         WHERE ${where}
         ORDER BY hn.created_at DESC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );

      return { notes: rows.rows.map(mapSummary), total: Number(count.rows[0]?.count ?? 0) };
    }, this.databasePool);
  }

  async findById(
    tenantId: string,
    actorId: string,
    actorRoles: string[],
    handoffNoteId: string,
    scope: OperationalAccessScope
  ): Promise<HandoffNoteSummary | null> {
    return withTenantTransaction({ tenantId, userId: actorId }, (client) =>
      this.findByIdWithClient(client, tenantId, actorId, actorRoles, handoffNoteId, scope), this.databasePool);
  }

  async create(tenantId: string, actorId: string, input: CreateHandoffNoteInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const recipientIds = input.recipientUserIds.length
        ? [...new Set(input.recipientUserIds)]
        : await this.resolveDefaultRecipients(client, tenantId, actorId);
      await this.assertValidRecipients(client, tenantId, recipientIds);
      const patientName = await this.resolvePatientName(client, tenantId, input.patientId);

      try {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO handoff_notes (
             tenant_id, patient_id, appointment_id, created_by_user_id, title, content, priority
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            tenantId,
            input.patientId,
            input.appointmentId ?? null,
            actorId,
            input.title,
            input.content,
            input.priority
          ]
        );
        const handoffNoteId = inserted.rows[0]!.id;

        await client.query(
          `INSERT INTO handoff_note_recipients (tenant_id, handoff_note_id, user_id)
           SELECT $1, $2, unnest($3::uuid[])`,
          [tenantId, handoffNoteId, recipientIds]
        );

        for (const recipientId of recipientIds.filter((recipientId) => recipientId !== actorId)) {
          await insertNotification(client, {
            tenantId,
            userId: recipientId,
            type: "handoff_note_received",
            title: "Nueva nota de enlace",
            message: input.title,
            metadata: {
              target: {
                type: "handoff_note",
                entityId: handoffNoteId,
                handoffNoteId,
                patientId: input.patientId
              },
              patient: { id: input.patientId, fullName: patientName },
              handoffNote: { id: handoffNoteId }
            }
          });
        }

        return (await this.findByIdWithClient(client, tenantId, actorId, [], handoffNoteId, {
          tenantWide: false,
          clinics: false,
          ownCollaborator: false
        }))!;
      } catch (error) {
        throw mapDatabaseError(error);
      }
    }, this.databasePool);
  }

  async markAsRead(tenantId: string, actorId: string, handoffNoteId: string) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const recipient = await client.query(
        `SELECT 1 FROM handoff_note_recipients
         WHERE tenant_id = $1 AND handoff_note_id = $2 AND user_id = $3`,
        [tenantId, handoffNoteId, actorId]
      );
      if (recipient.rowCount === 0) {
        const note = await client.query(
          `SELECT 1 FROM handoff_notes WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [tenantId, handoffNoteId]
        );
        if (note.rowCount === 0) throw new NotFoundError("Handoff note not found", "HANDOFF_NOTE_NOT_FOUND");
        throw new ForbiddenError("You are not a recipient of this note", "HANDOFF_NOTE_NOT_RECIPIENT");
      }

      await client.query(
        `UPDATE handoff_note_recipients SET read_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND handoff_note_id = $2 AND user_id = $3 AND read_at IS NULL`,
        [tenantId, handoffNoteId, actorId]
      );
      await client.query(
        `UPDATE handoff_notes SET status = 'read'
         WHERE tenant_id = $1 AND id = $2 AND status = 'pending'`,
        [tenantId, handoffNoteId]
      );

      return (await this.findByIdWithClient(client, tenantId, actorId, [], handoffNoteId, {
        tenantWide: false,
        clinics: false,
        ownCollaborator: false
      }))!;
    }, this.databasePool);
  }

  private async findByIdWithClient(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    actorRoles: string[],
    handoffNoteId: string,
    scope: OperationalAccessScope
  ) {
    const values: unknown[] = [tenantId, handoffNoteId];
    const filters = ["hn.tenant_id = $1", "hn.id = $2", "hn.deleted_at IS NULL"];
    if (!this.canReadTenantWide(actorRoles)) {
      const hasAccess = await this.appendVisibilityFilter(client, tenantId, actorId, scope, values, filters);
      if (!hasAccess) return null;
    }
    const result = await client.query<HandoffNoteRow>(
      `${SELECT_HANDOFF_NOTE}
       WHERE ${filters.join(" AND ")}`,
      values
    );
    return result.rows[0] ? mapSummary(result.rows[0]) : null;
  }

  private canReadTenantWide(actorRoles: string[]) {
    return actorRoles.some((role) => role === "admin" || role === "direccion");
  }

  private async appendVisibilityFilter(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    scope: OperationalAccessScope,
    values: unknown[],
    filters: string[]
  ): Promise<boolean> {
    const clauses: string[] = [];

    values.push(actorId);
    const actorParam = `$${values.length}`;
    clauses.push(`hn.created_by_user_id = ${actorParam}`);
    clauses.push(`EXISTS (
      SELECT 1 FROM handoff_note_recipients hnr
      WHERE hnr.tenant_id = hn.tenant_id
        AND hnr.handoff_note_id = hn.id
        AND hnr.user_id = ${actorParam}
    )`);

    if (scope.clinics) {
      const clinicIds = await this.resolveAccessibleClinicIds(client, tenantId, actorId);
      if (clinicIds.length > 0) {
        values.push(clinicIds);
        const clinicsParam = `$${values.length}`;
        clauses.push(`EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.tenant_id = hn.tenant_id
            AND a.id = hn.appointment_id
            AND a.clinic_id = ANY(${clinicsParam}::uuid[])
            AND a.deleted_at IS NULL
        )`);
        clauses.push(`EXISTS (
          SELECT 1 FROM appointments patient_scope
          WHERE patient_scope.tenant_id = hn.tenant_id
            AND patient_scope.patient_id = hn.patient_id
            AND patient_scope.clinic_id = ANY(${clinicsParam}::uuid[])
            AND patient_scope.deleted_at IS NULL
        )`);
      }
    }

    if (clauses.length === 0) return false;
    filters.push(`(${clauses.join(" OR ")})`);
    return true;
  }

  private async resolveAccessibleClinicIds(client: PoolClient, tenantId: string, userId: string) {
    const result = await client.query<{ clinic_id: string }>(
      `SELECT clinic_id FROM user_clinic_access WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId]
    );
    return result.rows.map((row) => row.clinic_id);
  }

  private async resolveDefaultRecipients(client: PoolClient, tenantId: string, actorId: string) {
    const result = await client.query<{ id: string }>(
      `SELECT DISTINCT u.id
       FROM users u
       JOIN user_roles ur ON ur.tenant_id = u.tenant_id AND ur.user_id = u.id
       JOIN roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
       WHERE u.tenant_id = $1
         AND u.id <> $2
         AND u.status = 'active'
         AND u.deleted_at IS NULL
         AND r.name = ANY($3::varchar[])
         AND r.deleted_at IS NULL
       ORDER BY u.id`,
      [tenantId, actorId, VALID_RECIPIENT_ROLES]
    );

    return result.rows.map((row) => row.id);
  }

  private async assertValidRecipients(client: PoolClient, tenantId: string, recipientIds: string[]) {
    const result = await client.query<{ count: string }>(
      `SELECT count(DISTINCT u.id)::text AS count
       FROM users u
       JOIN user_roles ur ON ur.tenant_id = u.tenant_id AND ur.user_id = u.id
       JOIN roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
       WHERE u.tenant_id = $1 AND u.id = ANY($2::uuid[]) AND u.deleted_at IS NULL
         AND r.name = ANY($3::varchar[]) AND r.deleted_at IS NULL`,
      [tenantId, recipientIds, VALID_RECIPIENT_ROLES]
    );
    if (Number(result.rows[0]?.count) !== recipientIds.length) {
      throw new BadRequestError(
        "All recipients must hold the admin, medico, or terapeuta role",
        "INVALID_RECIPIENT"
      );
    }
  }

  private async resolvePatientName(client: PoolClient, tenantId: string, patientId: string) {
    const result = await client.query<{ full_name: string }>(
      `SELECT full_name FROM patients WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [tenantId, patientId]
    );
    return result.rows[0]?.full_name ?? null;
  }
}

function mapSummary(row: HandoffNoteRow): HandoffNoteSummary {
  return {
    id: row.id,
    patient: { id: row.patient_id, fullName: row.patient_full_name },
    appointmentId: row.appointment_id,
    createdBy: {
      id: row.created_by_user_id,
      fullName: row.created_by_full_name,
      role: row.created_by_role,
      area: row.created_by_area
    },
    title: row.title,
    content: row.content,
    priority: row.priority,
    status: row.status,
    recipients: row.recipients,
    createdAt: row.created_at
  };
}

function mapDatabaseError(error: unknown): Error {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
  if (code === "23503" || code === "23514") {
    return new BadRequestError("Handoff note violates a data constraint", "INVALID_HANDOFF_NOTE_DATA");
  }
  return error instanceof Error ? error : new Error("Unknown database error");
}
