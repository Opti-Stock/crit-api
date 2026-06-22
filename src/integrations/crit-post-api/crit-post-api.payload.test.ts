import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAttendanceRegisteredPayload } from "./crit-post-api.payload.js";

test("attendance payload contains only the provisional operational contract", () => {
  const payload = buildAttendanceRegisteredPayload({
    eventId: "event-id",
    tenantCode: "CRIT-OCC-01",
    attendanceId: "attendance-id",
    appointmentId: "appointment-id",
    patientExternalId: "patient-external",
    collaboratorExternalId: null,
    status: "present",
    checkedAt: "2026-06-22T12:00:00.000Z"
  });

  assert.deepEqual(payload, {
    schemaVersion: 1,
    eventId: "event-id",
    eventType: "attendance.registered",
    occurredAt: "2026-06-22T12:00:00.000Z",
    tenantCode: "CRIT-OCC-01",
    data: {
      attendanceId: "attendance-id",
      appointmentId: "appointment-id",
      patientExternalId: "patient-external",
      collaboratorExternalId: null,
      status: "present",
      checkedAt: "2026-06-22T12:00:00.000Z"
    }
  });
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("notesRequired"), false);
  assert.equal(serialized.includes("medical"), false);
  assert.equal(serialized.includes("fullName"), false);
});
