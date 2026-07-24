import { createHash } from "node:crypto";

import type { AuthenticatedRequestContext } from "../../types/global.js";
import { resolveOperationalAccessScope } from "../../shared/access/operational-access-scope.js";
import {
  RECOMMENDATION_WINDOW_DAYS,
  SCHEDULING_SCORE_WEIGHTS
} from "./scheduling.constants.js";
import type {
  SchedulingCandidate,
  SchedulingRepository
} from "./scheduling.repository.js";
import type { AppointmentRecommendationsInput } from "./scheduling.validation.js";

export interface RecommendationReason {
  code:
    | "PATIENT_COMPACTION"
    | "COLLABORATOR_COMPACTION"
    | "ROOM_COMPACTION"
    | "PATIENT_PREFERENCE"
    | "COLLABORATOR_CONTINUITY"
    | "TEMPORAL_PROXIMITY";
  points: number;
}

export interface AppointmentRecommendation {
  recommendationId: string;
  startsAt: string;
  endsAt: string;
  patientId: string;
  clinic: { id: string; name: string };
  collaborator: { id: string; fullName: string };
  room: { id: string; name: string };
  appointmentType: { id: string; name: string };
  preSessionMinutes: number;
  postSessionMinutes: number;
  score: number;
  reasons: RecommendationReason[];
  metrics: {
    patientGapMinutes: number | null;
    collaboratorGapMinutes: number | null;
    roomGapMinutes: number | null;
    matchesPreference: boolean;
    keepsContinuity: boolean;
  };
}

export class SchedulingService {
  constructor(private readonly repository: SchedulingRepository) {}

  async recommend(
    context: AuthenticatedRequestContext,
    input: AppointmentRecommendationsInput
  ) {
    const candidates = await this.repository.findCandidates(
      context.tenantId,
      context.userId,
      input,
      resolveOperationalAccessScope(context.roles)
    );
    const referenceTime = input.localDate
      ? Date.parse(`${input.localDate}T00:00:00Z`)
      : Date.now();
    const recommendations = candidates
      .map((candidate) => scoreCandidate(candidate, referenceTime))
      .sort(compareRecommendations)
      .slice(0, input.limit);

    return {
      timeZone: candidates[0]?.timeZone ?? null,
      window: {
        localDate: input.localDate ?? null,
        days: input.localDate ? 1 : RECOMMENDATION_WINDOW_DAYS
      },
      criteria: {
        patientId: input.patientId,
        clinicId: input.clinicId,
        collaboratorId: input.collaboratorId ?? null,
        appointmentTypeId: input.appointmentTypeId ?? null,
        roomId: input.roomId ?? null
      },
      recommendations
    };
  }
}

export function scoreCandidate(
  candidate: SchedulingCandidate,
  referenceTime: number
): AppointmentRecommendation {
  const patientPoints = gapPoints(
    candidate.patientGapMinutes,
    SCHEDULING_SCORE_WEIGHTS.patientCompaction,
    240
  );
  const collaboratorPoints = gapPoints(
    candidate.collaboratorGapMinutes,
    SCHEDULING_SCORE_WEIGHTS.collaboratorCompaction,
    180
  );
  const roomPoints = gapPoints(
    candidate.roomGapMinutes,
    SCHEDULING_SCORE_WEIGHTS.roomCompaction,
    180
  );
  const preferencePoints = candidate.matchesPreference
    ? SCHEDULING_SCORE_WEIGHTS.patientPreference
    : 0;
  const continuityPoints = candidate.keepsContinuity
    ? SCHEDULING_SCORE_WEIGHTS.collaboratorContinuity
    : 0;
  const ageDays = Math.max(0, (Date.parse(candidate.startsAt) - referenceTime) / 86_400_000);
  const proximityPoints = round(
    SCHEDULING_SCORE_WEIGHTS.temporalProximity
      * Math.max(0, 1 - ageDays / RECOMMENDATION_WINDOW_DAYS)
  );
  const reasons: RecommendationReason[] = [
    { code: "PATIENT_COMPACTION", points: patientPoints },
    { code: "COLLABORATOR_COMPACTION", points: collaboratorPoints },
    { code: "ROOM_COMPACTION", points: roomPoints },
    { code: "PATIENT_PREFERENCE", points: preferencePoints },
    { code: "COLLABORATOR_CONTINUITY", points: continuityPoints },
    { code: "TEMPORAL_PROXIMITY", points: proximityPoints }
  ];

  const recommendationId = createHash("sha256")
    .update([
      candidate.patientId,
      candidate.clinicId,
      candidate.collaboratorId,
      candidate.roomId,
      candidate.appointmentTypeId,
      candidate.startsAt,
      candidate.endsAt
    ].join(":"))
    .digest("hex")
    .slice(0, 32);

  return {
    recommendationId,
    startsAt: candidate.startsAt,
    endsAt: candidate.endsAt,
    patientId: candidate.patientId,
    clinic: { id: candidate.clinicId, name: candidate.clinicName },
    collaborator: {
      id: candidate.collaboratorId,
      fullName: candidate.collaboratorName
    },
    room: { id: candidate.roomId, name: candidate.roomName },
    appointmentType: {
      id: candidate.appointmentTypeId,
      name: candidate.appointmentTypeName
    },
    preSessionMinutes: candidate.preSessionMinutes,
    postSessionMinutes: candidate.postSessionMinutes,
    score: round(reasons.reduce((sum, reason) => sum + reason.points, 0)),
    reasons,
    metrics: {
      patientGapMinutes: candidate.patientGapMinutes,
      collaboratorGapMinutes: candidate.collaboratorGapMinutes,
      roomGapMinutes: candidate.roomGapMinutes,
      matchesPreference: candidate.matchesPreference,
      keepsContinuity: candidate.keepsContinuity
    }
  };
}

function gapPoints(gap: number | null, weight: number, ceilingMinutes: number) {
  if (gap === null) return 0;
  return round(weight * Math.max(0, 1 - Math.min(gap, ceilingMinutes) / ceilingMinutes));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function compareRecommendations(
  left: AppointmentRecommendation,
  right: AppointmentRecommendation
) {
  return right.score - left.score
    || left.startsAt.localeCompare(right.startsAt)
    || left.collaborator.id.localeCompare(right.collaborator.id)
    || left.room.id.localeCompare(right.room.id);
}
