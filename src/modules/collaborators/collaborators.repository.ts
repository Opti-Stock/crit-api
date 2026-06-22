import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import type { ListCollaboratorsInput } from "./collaborators.validation.js";

export interface CollaboratorSummary {
  id: string;
  fullName: string;
  externalId: string | null;
  specialty: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  status: "active" | "inactive";
}

export interface CollaboratorDetail extends CollaboratorSummary {
  clinics: { clinicId: string; clinicName: string; roleInClinic: string | null }[];
}

interface CollaboratorRow {
  id: string;
  full_name: string;
  external_id: string | null;
  specialty: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  status: "active" | "inactive";
}

interface CollaboratorDetailRow extends CollaboratorRow {
  clinics: CollaboratorDetail["clinics"];
}

export class CollaboratorsRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async list(tenantId: string, actorId: string, input: ListCollaboratorsInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const filters = ["c.tenant_id = $1", "c.deleted_at IS NULL"];
      const values: unknown[] = [tenantId];
      const joins: string[] = [];

      if (input.clinicId) {
        joins.push(
          "JOIN collaborator_clinics cc ON cc.tenant_id = c.tenant_id AND cc.collaborator_id = c.id"
        );
        values.push(input.clinicId);
        filters.push(`cc.clinic_id = $${values.length}`);
      }
      if (input.search) {
        values.push(`%${input.search}%`);
        filters.push(`(c.full_name ILIKE $${values.length} OR c.specialty ILIKE $${values.length})`);
      }
      if (input.status) {
        values.push(input.status);
        filters.push(`c.status = $${values.length}`);
      }

      const join = joins.join(" ");
      const where = filters.join(" AND ");
      const count = await client.query<{ count: string }>(
        `SELECT count(DISTINCT c.id)::text AS count FROM collaborators c ${join} WHERE ${where}`,
        values
      );

      values.push(input.pageSize, (input.page - 1) * input.pageSize);
      const rows = await client.query<CollaboratorRow>(
        `SELECT DISTINCT c.id, c.full_name, c.external_id, c.specialty, c.position, c.phone, c.email, c.gender, c.status
         FROM collaborators c ${join}
         WHERE ${where}
         ORDER BY c.full_name, c.id
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );

      return { collaborators: rows.rows.map(mapSummary), total: Number(count.rows[0]?.count ?? 0) };
    }, this.databasePool);
  }

  async findById(
    tenantId: string,
    actorId: string,
    collaboratorId: string
  ): Promise<CollaboratorDetail | null> {
    return withTenantTransaction({ tenantId, userId: actorId }, (client) =>
      this.findByIdWithClient(client, tenantId, collaboratorId), this.databasePool);
  }

  private async findByIdWithClient(client: PoolClient, tenantId: string, collaboratorId: string) {
    const result = await client.query<CollaboratorDetailRow>(
      `SELECT c.id, c.full_name, c.external_id, c.specialty, c.position, c.phone, c.email, c.gender, c.status,
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('clinicId', cl.id, 'clinicName', cl.name, 'roleInClinic', cc.role_in_clinic) ORDER BY cl.name)
           FROM collaborator_clinics cc JOIN clinics cl ON cl.tenant_id = cc.tenant_id AND cl.id = cc.clinic_id
           WHERE cc.tenant_id = c.tenant_id AND cc.collaborator_id = c.id AND cl.deleted_at IS NULL),
          '[]'
        ) AS clinics
       FROM collaborators c
       WHERE c.tenant_id = $1 AND c.id = $2 AND c.deleted_at IS NULL`,
      [tenantId, collaboratorId]
    );
    return result.rows[0] ? mapDetail(result.rows[0]) : null;
  }
}

function mapSummary(row: CollaboratorRow): CollaboratorSummary {
  return {
    id: row.id,
    fullName: row.full_name,
    externalId: row.external_id,
    specialty: row.specialty,
    position: row.position,
    phone: row.phone,
    email: row.email,
    gender: row.gender,
    status: row.status
  };
}
function mapDetail(row: CollaboratorDetailRow): CollaboratorDetail {
  return { ...mapSummary(row), clinics: row.clinics };
}
