export const SCHEDULING_SCORE_WEIGHTS = {
  patientCompaction: 30,
  collaboratorCompaction: 25,
  roomCompaction: 15,
  patientPreference: 15,
  collaboratorContinuity: 10,
  temporalProximity: 5
} as const;

export const RECOMMENDATION_INTERVAL_MINUTES = 5;
export const RECOMMENDATION_WINDOW_DAYS = 30;
export const DEFAULT_RECOMMENDATION_LIMIT = 5;
export const MAX_RECOMMENDATION_LIMIT = 10;
