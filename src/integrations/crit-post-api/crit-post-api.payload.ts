import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

import type { AttendanceRegisteredPayload } from "./crit-post-api.types.js";

interface AttendancePayloadRow {
  tenant_code: string;
  patient_external_id: string | null;
  collaborator_external_id: string | null;
}

export async function insertAttendanceRegisteredEvent(
  client: PoolClient,
  input: {
    tenantId: string;
    attendanceId: string;
    appointmentId: string;
    patientId: string;
    collaboratorId: string;
    status: string;
    checkedAt: string;
  }
): Promise<string> {
  const metadata = await client.query<AttendancePayloadRow>(
    `SELECT t.code AS tenant_code,
            p.external_id AS patient_external_id,
            c.external_id AS collaborator_external_id
       FROM tenants t
       JOIN patients p ON p.tenant_id = t.id AND p.id = $2 AND p.deleted_at IS NULL
       JOIN collaborators c ON c.tenant_id = t.id AND c.id = $3 AND c.deleted_at IS NULL
      WHERE t.id = $1 AND t.status = 'active' AND t.deleted_at IS NULL`,
    [input.tenantId, input.patientId, input.collaboratorId]
  );
  const row = metadata.rows[0];
  if (!row) throw new Error("Unable to build attendance integration event");

  const eventId = randomUUID();
  const payload = buildAttendanceRegisteredPayload({
    eventId,
    tenantCode: row.tenant_code,
    attendanceId: input.attendanceId,
    appointmentId: input.appointmentId,
    patientExternalId: row.patient_external_id,
    collaboratorExternalId: row.collaborator_external_id,
    status: input.status,
    checkedAt: input.checkedAt
  });

  await client.query(
    `INSERT INTO crit_api_outbox (id, tenant_id, entity_type, entity_id, payload)
     VALUES ($1, $2, 'attendance', $3, $4::jsonb)`,
    [eventId, input.tenantId, input.attendanceId, JSON.stringify(payload)]
  );

  return eventId;
}

export function buildAttendanceRegisteredPayload(input: {
  eventId: string;
  tenantCode: string;
  attendanceId: string;
  appointmentId: string;
  patientExternalId: string | null;
  collaboratorExternalId: string | null;
  status: string;
  checkedAt: string;
}): AttendanceRegisteredPayload {
  return {
    schemaVersion: 1,
    eventId: input.eventId,
    eventType: "attendance.registered",
    occurredAt: input.checkedAt,
    tenantCode: input.tenantCode,
    data: {
      attendanceId: input.attendanceId,
      appointmentId: input.appointmentId,
      patientExternalId: input.patientExternalId,
      collaboratorExternalId: input.collaboratorExternalId,
      status: input.status,
      checkedAt: input.checkedAt
    }
  };
}
