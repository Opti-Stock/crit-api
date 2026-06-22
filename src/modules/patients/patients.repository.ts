import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import type { ListPatientsInput } from "./patients.validation.js";

export interface PatientSummary {
  id: string;
  fullName: string;
  externalId: string | null;
  birthDate: string;
  phone: string | null;
  email: string | null;
  disability: string | null;
  gender: string | null;
  status: "active" | "inactive";
}

interface PatientRow {
  id: string;
  full_name: string;
  external_id: string | null;
  birth_date: string;
  phone: string | null;
  email: string | null;
  disability: string | null;
  gender: string | null;
  status: "active" | "inactive";
}

export class PatientsRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async list(tenantId: string, actorId: string, input: ListPatientsInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const filters = ["tenant_id = $1", "deleted_at IS NULL"];
      const values: unknown[] = [tenantId];

      if (input.search) {
        values.push(`%${input.search}%`);
        filters.push(`(full_name ILIKE $${values.length} OR external_id ILIKE $${values.length})`);
      }
      if (input.status) {
        values.push(input.status);
        filters.push(`status = $${values.length}`);
      }

      const where = filters.join(" AND ");
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM patients WHERE ${where}`,
        values
      );

      values.push(input.pageSize, (input.page - 1) * input.pageSize);
      const rows = await client.query<PatientRow>(
        `SELECT id, full_name, external_id, birth_date, phone, email, disability, gender, status
         FROM patients
         WHERE ${where}
         ORDER BY full_name, id
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );

      return { patients: rows.rows.map(mapSummary), total: Number(count.rows[0]?.count ?? 0) };
    }, this.databasePool);
  }

  async findById(tenantId: string, actorId: string, patientId: string): Promise<PatientSummary | null> {
    return withTenantTransaction({ tenantId, userId: actorId }, (client) =>
      this.findByIdWithClient(client, tenantId, patientId), this.databasePool);
  }

  private async findByIdWithClient(client: PoolClient, tenantId: string, patientId: string) {
    const result = await client.query<PatientRow>(
      `SELECT id, full_name, external_id, birth_date, phone, email, disability, gender, status
       FROM patients
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [tenantId, patientId]
    );
    return result.rows[0] ? mapSummary(result.rows[0]) : null;
  }
}

function mapSummary(row: PatientRow): PatientSummary {
  return {
    id: row.id,
    fullName: row.full_name,
    externalId: row.external_id,
    birthDate: row.birth_date,
    phone: row.phone,
    email: row.email,
    disability: row.disability,
    gender: row.gender,
    status: row.status
  };
}
