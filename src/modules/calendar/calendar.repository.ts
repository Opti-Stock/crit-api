import type { Pool } from "pg";

import { pool } from "../../config/db.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";

export interface AppointmentTypeSummary {
  id: string;
  name: string;
  defaultDurationMinutes: number;
  defaultPreSessionMinutes: number;
  defaultPostSessionMinutes: number;
}

interface AppointmentTypeRow {
  id: string;
  name: string;
  default_duration_minutes: number;
  default_pre_session_minutes: number;
  default_post_session_minutes: number;
}

export class CalendarRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async listAppointmentTypes(tenantId: string, actorId: string): Promise<AppointmentTypeSummary[]> {
    return withTenantTransaction(
      { tenantId, userId: actorId },
      async (client) => {
        const result = await client.query<AppointmentTypeRow>(
          `SELECT id, name, default_duration_minutes, default_pre_session_minutes, default_post_session_minutes
           FROM appointment_types
           WHERE tenant_id = $1 AND deleted_at IS NULL
           ORDER BY name`,
          [tenantId]
        );
        return result.rows.map(mapSummary);
      },
      this.databasePool
    );
  }
}

function mapSummary(row: AppointmentTypeRow): AppointmentTypeSummary {
  return {
    id: row.id,
    name: row.name,
    defaultDurationMinutes: row.default_duration_minutes,
    defaultPreSessionMinutes: row.default_pre_session_minutes,
    defaultPostSessionMinutes: row.default_post_session_minutes
  };
}
