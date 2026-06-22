export interface AttendanceRegisteredPayload {
  schemaVersion: 1;
  eventId: string;
  eventType: "attendance.registered";
  occurredAt: string;
  tenantCode: string;
  data: {
    attendanceId: string;
    appointmentId: string;
    patientExternalId: string | null;
    collaboratorExternalId: string | null;
    status: string;
    checkedAt: string;
  };
}

export interface OutboxEvent {
  id: string;
  tenantId: string;
  payload: Record<string, unknown>;
  retryCount: number;
}

export interface ProcessingSummary {
  claimed: number;
  sent: number;
  failed: number;
  recovered: number;
}
