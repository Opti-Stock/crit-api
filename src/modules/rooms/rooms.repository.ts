import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import type { ListRoomsInput } from "./rooms.validation.js";

export interface RoomSummary {
  id: string;
  name: string;
  capacity: number | null;
  status: "active" | "inactive";
  clinic: { id: string; name: string };
}

interface RoomRow {
  id: string;
  name: string;
  capacity: number | null;
  status: "active" | "inactive";
  clinic_id: string;
  clinic_name: string;
}

export class RoomsRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async list(tenantId: string, actorId: string, input: ListRoomsInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const filters = ["r.tenant_id = $1", "r.deleted_at IS NULL"];
      const values: unknown[] = [tenantId];

      if (input.clinicId) {
        values.push(input.clinicId);
        filters.push(`r.clinic_id = $${values.length}`);
      }
      if (input.search) {
        values.push(`%${input.search}%`);
        filters.push(`r.name ILIKE $${values.length}`);
      }
      if (input.status) {
        values.push(input.status);
        filters.push(`r.status = $${values.length}`);
      }

      const where = filters.join(" AND ");
      const count = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM rooms r WHERE ${where}`,
        values
      );

      values.push(input.pageSize, (input.page - 1) * input.pageSize);
      const rows = await client.query<RoomRow>(
        `SELECT r.id, r.name, r.capacity, r.status, cl.id AS clinic_id, cl.name AS clinic_name
         FROM rooms r
         JOIN clinics cl ON cl.tenant_id = r.tenant_id AND cl.id = r.clinic_id
         WHERE ${where}
         ORDER BY cl.name, r.name, r.id
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      );

      return { rooms: rows.rows.map(mapSummary), total: Number(count.rows[0]?.count ?? 0) };
    }, this.databasePool);
  }

  async findById(tenantId: string, actorId: string, roomId: string): Promise<RoomSummary | null> {
    return withTenantTransaction({ tenantId, userId: actorId }, (client) =>
      this.findByIdWithClient(client, tenantId, roomId), this.databasePool);
  }

  private async findByIdWithClient(client: PoolClient, tenantId: string, roomId: string) {
    const result = await client.query<RoomRow>(
      `SELECT r.id, r.name, r.capacity, r.status, cl.id AS clinic_id, cl.name AS clinic_name
       FROM rooms r
       JOIN clinics cl ON cl.tenant_id = r.tenant_id AND cl.id = r.clinic_id
       WHERE r.tenant_id = $1 AND r.id = $2 AND r.deleted_at IS NULL`,
      [tenantId, roomId]
    );
    return result.rows[0] ? mapSummary(result.rows[0]) : null;
  }
}

function mapSummary(row: RoomRow): RoomSummary {
  return {
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    status: row.status,
    clinic: { id: row.clinic_id, name: row.clinic_name }
  };
}
