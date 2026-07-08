import assert from "node:assert/strict";
import { test } from "node:test";

import { insertNotification, mapNotificationRowForTest } from "./notifications.repository.js";

test("notification mapping enriches metadata with related patient name", () => {
  const notification = mapNotificationRowForTest({
    id: "11111111-1111-4111-8111-111111111111",
    type: "handoff_note_received",
    title: "Nueva nota de enlace",
    message: "Seguimiento",
    metadata: {
      target: {
        type: "handoff_note",
        patientId: "22222222-2222-4222-8222-222222222222"
      }
    },
    patient_id: "22222222-2222-4222-8222-222222222222",
    patient_full_name: "Paciente Demo",
    read_at: null,
    created_at: "2026-07-08T00:00:00.000Z"
  });

  assert.deepEqual(notification.metadata?.patient, {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Paciente Demo"
  });
});

test("notification insert skips the actor's own unread counter", async () => {
  let queryCount = 0;
  const client = {
    query() {
      queryCount += 1;
      throw new Error("query should not be called for self notifications");
    }
  };

  await insertNotification(client as never, {
    tenantId: "11111111-1111-4111-8111-111111111111",
    actorId: "22222222-2222-4222-8222-222222222222",
    userId: "22222222-2222-4222-8222-222222222222",
    type: "handoff_note_received",
    title: "Nueva nota de enlace",
    message: "Seguimiento"
  });

  assert.equal(queryCount, 0);
});
