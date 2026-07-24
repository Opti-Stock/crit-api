import assert from "node:assert/strict";
import { test } from "node:test";

import type { SchedulingCandidate } from "./scheduling.repository.js";
import { scoreCandidate } from "./scheduling.service.js";

const candidate: SchedulingCandidate = {
  patientId: "00000000-0000-0000-0000-000000000001",
  clinicId: "00000000-0000-0000-0000-000000000002",
  clinicName: "Demo clinic",
  timeZone: "America/Mexico_City",
  collaboratorId: "00000000-0000-0000-0000-000000000003",
  collaboratorName: "Demo professional",
  roomId: "00000000-0000-0000-0000-000000000004",
  roomName: "Demo room",
  appointmentTypeId: "00000000-0000-0000-0000-000000000005",
  appointmentTypeName: "Demo therapy",
  startsAt: "2026-08-10T12:00:00.000Z",
  endsAt: "2026-08-10T13:00:00.000Z",
  preSessionMinutes: 5,
  postSessionMinutes: 5,
  patientGapMinutes: 0,
  collaboratorGapMinutes: 0,
  roomGapMinutes: 0,
  matchesPreference: true,
  keepsContinuity: true
};

test("a fully compact candidate receives all one hundred points", () => {
  const recommendation = scoreCandidate(candidate, Date.parse(candidate.startsAt));
  assert.equal(recommendation.score, 100);
  assert.equal(recommendation.reasons.reduce((sum, reason) => sum + reason.points, 0), 100);
});

test("recommendation identifiers and scores are deterministic", () => {
  const first = scoreCandidate(candidate, Date.parse(candidate.startsAt));
  const second = scoreCandidate(candidate, Date.parse(candidate.startsAt));
  assert.equal(first.recommendationId, second.recommendationId);
  assert.equal(first.score, second.score);
});

test("missing neighboring appointments do not receive compaction points", () => {
  const result = scoreCandidate({
    ...candidate,
    patientGapMinutes: null,
    collaboratorGapMinutes: null,
    roomGapMinutes: null,
    matchesPreference: false,
    keepsContinuity: false
  }, Date.parse(candidate.startsAt));
  assert.equal(result.score, 5);
});
