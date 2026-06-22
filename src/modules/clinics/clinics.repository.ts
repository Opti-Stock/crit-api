import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import type { ListClinicsInput } from "./clinics.validation.js";

export interface ClinicSummary {
  id: string;
  name: string;
  specialization: string | null;
  capacity: number | null;
  status: "active" | "inactive";
  coordinator: { id: string; fullName: string } | null;
  roomCount: number;
}

export interface ClinicDetail extends ClinicSummary {
  rooms: { id: string; name: string; capacity: number | null; status: "active" | "inactive" }[];
}

interface ClinicRow {
  id: string;
  name: string;
  specialization: string | null;
  capacity: number | null;
  status: "active" | "inactive";
  coordinator_id: string | null;
  coordinator_full_name: string | null;
  room_count: string;
}

interface ClinicDetailRow extends ClinicRow {
  rooms: ClinicDetail["rooms"];
}

export class ClinicsRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async list(tenantId: string, actorId: string, input: ListClinicsInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const filters = ["cl.tenant_id = $1", "cl.deleted_at IS NULL"];
      const values: unknown[] = [tenantId];

      if (input.search) {
        values.push(`%${input.search}%`);
        filters.push(`(cl.name ILIKE $${values.length} OR cl.specialization ILIKE $${values.length})`);
      }
      if (input.status) {
        values.push(input.status);
        filters.push(`cl.status = $${values.length}`);
      }

      const where = filters.join(" AND ");
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM clinics cl WHERE ${where}`,
        values
      );

      values.push(input.pageSize, (input.page - 1) * input.pageSize);
      const rows = await client.query<ClinicRow>(
        `SELECT cl.id, cl.name, cl.specialization, cl.capacity, cl.status,
          co.id AS coordinator_id, co.full_name AS coordinator_full_name,
          (SELECT count(*) FROM rooms r WHERE r.tenant_id = cl.tenant_id AND r.clinic_id = cl.id AND r.deleted_at IS NULL) AS room_count
         FROM clinics cl
         LEFT JOIN collaborators co ON co.tenant_id = cl.tenant_id AND co.id = cl.coordinator_id AND co.deleted_at IS NULL
         WHERE ${where}
         ORDER BY cl.name, cl.id
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );

      return { clinics: rows.rows.map(mapSummary), total: Number(count.rows[0]?.count ?? 0) };
    }, this.databasePool);
  }

  async findById(tenantId: string, actorId: string, clinicId: string): Promise<ClinicDetail | null> {
    return withTenantTransaction({ tenantId, userId: actorId }, (client) =>
      this.findByIdWithClient(client, tenantId, clinicId), this.databasePool);
  }

  private async findByIdWithClient(client: PoolClient, tenantId: string, clinicId: string) {
    const result = await client.query<ClinicDetailRow>(
      `SELECT cl.id, cl.name, cl.specialization, cl.capacity, cl.status,
        co.id AS coordinator_id, co.full_name AS coordinator_full_name,
        (SELECT count(*) FROM rooms r WHERE r.tenant_id = cl.tenant_id AND r.clinic_id = cl.id AND r.deleted_at IS NULL) AS room_count,
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'capacity', r.capacity, 'status', r.status) ORDER BY r.name)
           FROM rooms r WHERE r.tenant_id = cl.tenant_id AND r.clinic_id = cl.id AND r.deleted_at IS NULL),
          '[]'
        ) AS rooms
       FROM clinics cl
       LEFT JOIN collaborators co ON co.tenant_id = cl.tenant_id AND co.id = cl.coordinator_id AND co.deleted_at IS NULL
       WHERE cl.tenant_id = $1 AND cl.id = $2 AND cl.deleted_at IS NULL`,
      [tenantId, clinicId]
    );
    return result.rows[0] ? mapDetail(result.rows[0]) : null;
  }
}

function mapSummary(row: ClinicRow): ClinicSummary {
  return {
    id: row.id,
    name: row.name,
    specialization: row.specialization,
    capacity: row.capacity,
    status: row.status,
    coordinator: row.coordinator_id
      ? { id: row.coordinator_id, fullName: row.coordinator_full_name! }
      : null,
    roomCount: Number(row.room_count)
  };
}
function mapDetail(row: ClinicDetailRow): ClinicDetail {
  return { ...mapSummary(row), rooms: row.rooms };
}
