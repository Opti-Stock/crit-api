import type { Pool } from "pg";

import { pool } from "../../config/db.js";
import type { OperationalAccessScope } from "../../shared/access/operational-access-scope.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import { ForbiddenError, NotFoundError } from "../../shared/errors/app-error.js";
import type { AppointmentRecommendationsInput } from "./scheduling.validation.js";

export interface SchedulingCandidate {
  patientId: string;
  clinicId: string;
  clinicName: string;
  timeZone: string;
  collaboratorId: string;
  collaboratorName: string;
  roomId: string;
  roomName: string;
  appointmentTypeId: string;
  appointmentTypeName: string;
  startsAt: string;
  endsAt: string;
  preSessionMinutes: number;
  postSessionMinutes: number;
  patientGapMinutes: number | null;
  collaboratorGapMinutes: number | null;
  roomGapMinutes: number | null;
  matchesPreference: boolean;
  keepsContinuity: boolean;
}

interface CandidateRow {
  patient_id: string;
  clinic_id: string;
  clinic_name: string;
  time_zone: string;
  collaborator_id: string;
  collaborator_name: string;
  room_id: string;
  room_name: string;
  appointment_type_id: string;
  appointment_type_name: string;
  starts_at: string;
  ends_at: string;
  pre_session_minutes: number;
  post_session_minutes: number;
  patient_gap_minutes: number | null;
  collaborator_gap_minutes: number | null;
  room_gap_minutes: number | null;
  matches_preference: boolean;
  keeps_continuity: boolean;
}

export class SchedulingRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  async findCandidates(
    tenantId: string,
    actorId: string,
    input: AppointmentRecommendationsInput,
    scope: OperationalAccessScope
  ): Promise<SchedulingCandidate[]> {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const clinic = await client.query<{ name: string; time_zone: string }>(
        `SELECT name, time_zone
         FROM clinics
         WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [tenantId, input.clinicId]
      );
      if (!clinic.rows[0]) {
        throw new NotFoundError("Clinic not found", "CLINIC_NOT_FOUND");
      }

      if (!scope.tenantWide) {
        const access = await client.query(
          `SELECT 1
           FROM user_clinic_access
           WHERE tenant_id = $1 AND user_id = $2 AND clinic_id = $3`,
          [tenantId, actorId, input.clinicId]
        );
        if (!scope.clinics || access.rowCount === 0) {
          throw new ForbiddenError(
            "You cannot schedule appointments for this clinic",
            "SCHEDULING_CLINIC_FORBIDDEN"
          );
        }
      }

      const result = await client.query<CandidateRow>(
        CANDIDATES_SQL,
        [
          tenantId,
          input.patientId,
          input.clinicId,
          input.localDate ?? null,
          input.collaboratorId ?? null,
          input.appointmentTypeId ?? null,
          input.roomId ?? null
        ]
      );

      return result.rows.map(mapCandidate);
    }, this.databasePool);
  }
}

const CANDIDATES_SQL = `
  WITH requested AS (
    SELECT
      $1::uuid AS tenant_id,
      $2::uuid AS patient_id,
      $3::uuid AS clinic_id,
      COALESCE($4::date, (CURRENT_TIMESTAMP AT TIME ZONE cl.time_zone)::date) AS from_date,
      CASE
        WHEN $4::date IS NULL
          THEN (CURRENT_TIMESTAMP AT TIME ZONE cl.time_zone)::date + 29
        ELSE $4::date
      END AS to_date,
      cl.name AS clinic_name,
      cl.time_zone
    FROM clinics cl
    WHERE cl.tenant_id = $1
      AND cl.id = $3
      AND cl.deleted_at IS NULL
  ),
  combinations AS (
    SELECT
      req.*,
      at.id AS appointment_type_id,
      at.name AS appointment_type_name,
      at.default_duration_minutes,
      at.default_pre_session_minutes,
      at.default_post_session_minutes,
      co.id AS collaborator_id,
      co.full_name AS collaborator_name,
      r.id AS room_id,
      r.name AS room_name
    FROM requested req
    JOIN clinic_appointment_types cat
      ON cat.tenant_id = req.tenant_id
     AND cat.clinic_id = req.clinic_id
    JOIN appointment_types at
      ON at.tenant_id = cat.tenant_id
     AND at.id = cat.appointment_type_id
     AND at.deleted_at IS NULL
    JOIN collaborator_appointment_types coat
      ON coat.tenant_id = at.tenant_id
     AND coat.appointment_type_id = at.id
    JOIN collaborators co
      ON co.tenant_id = coat.tenant_id
     AND co.id = coat.collaborator_id
     AND co.deleted_at IS NULL
    JOIN collaborator_clinics cc
      ON cc.tenant_id = co.tenant_id
     AND cc.collaborator_id = co.id
     AND cc.clinic_id = req.clinic_id
    JOIN room_appointment_types rat
      ON rat.tenant_id = at.tenant_id
     AND rat.clinic_id = req.clinic_id
     AND rat.appointment_type_id = at.id
    JOIN rooms r
      ON r.tenant_id = rat.tenant_id
     AND r.clinic_id = rat.clinic_id
     AND r.id = rat.room_id
     AND r.deleted_at IS NULL
    WHERE ($5::uuid IS NULL OR co.id = $5)
      AND ($6::uuid IS NULL OR at.id = $6)
      AND ($7::uuid IS NULL OR r.id = $7)
  ),
  local_days AS (
    SELECT combination.*, day_value::date AS local_day
    FROM combinations combination
    CROSS JOIN LATERAL generate_series(
      combination.from_date,
      combination.to_date,
      INTERVAL '1 day'
    ) AS day_value
  ),
  windows AS (
    SELECT
      day.*,
      GREATEST(hours.start_time, availability.start_time) AS local_start,
      LEAST(hours.end_time, availability.end_time) AS local_end
    FROM local_days day
    JOIN clinic_operating_hours hours
      ON hours.tenant_id = day.tenant_id
     AND hours.clinic_id = day.clinic_id
     AND hours.weekday = EXTRACT(DOW FROM day.local_day)
     AND hours.deleted_at IS NULL
    JOIN collaborator_availability availability
      ON availability.tenant_id = day.tenant_id
     AND availability.collaborator_id = day.collaborator_id
     AND availability.clinic_id = day.clinic_id
     AND availability.weekday = EXTRACT(DOW FROM day.local_day)
     AND availability.valid_from <= day.local_day
     AND (availability.valid_to IS NULL OR availability.valid_to >= day.local_day)
     AND availability.deleted_at IS NULL
    WHERE GREATEST(hours.start_time, availability.start_time)
      < LEAST(hours.end_time, availability.end_time)
  ),
  candidates AS (
    SELECT
      window.*,
      slot.starts_at,
      slot.starts_at + make_interval(mins => window.default_duration_minutes) AS ends_at
    FROM windows window
    CROSS JOIN LATERAL generate_series(
      (window.local_day + window.local_start) AT TIME ZONE window.time_zone,
      ((window.local_day + window.local_end) AT TIME ZONE window.time_zone)
        - make_interval(mins => window.default_duration_minutes),
      INTERVAL '5 minutes'
    ) AS slot(starts_at)
    WHERE slot.starts_at >= CURRENT_TIMESTAMP
  ),
  available AS (
    SELECT candidate.*
    FROM candidates candidate
    WHERE NOT EXISTS (
      SELECT 1
      FROM scheduling_blocks block
      WHERE block.tenant_id = candidate.tenant_id
        AND block.clinic_id = candidate.clinic_id
        AND block.deleted_at IS NULL
        AND (block.collaborator_id IS NULL OR block.collaborator_id = candidate.collaborator_id)
        AND (block.room_id IS NULL OR block.room_id = candidate.room_id)
        AND block.starts_at < candidate.ends_at
          + make_interval(mins => candidate.default_post_session_minutes)
        AND block.ends_at > candidate.starts_at
          - make_interval(mins => candidate.default_pre_session_minutes)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM appointments appointment
      WHERE appointment.tenant_id = candidate.tenant_id
        AND appointment.deleted_at IS NULL
        AND appointment.status <> 'cancelled'
        AND (
          appointment.patient_id = candidate.patient_id
          OR appointment.collaborator_id = candidate.collaborator_id
          OR (
            appointment.clinic_id = candidate.clinic_id
            AND appointment.room_id = candidate.room_id
          )
        )
        AND appointment.starts_at
          - make_interval(mins => appointment.pre_session_minutes)
          < candidate.ends_at + make_interval(mins => candidate.default_post_session_minutes)
        AND appointment.ends_at
          + make_interval(mins => appointment.post_session_minutes)
          > candidate.starts_at - make_interval(mins => candidate.default_pre_session_minutes)
    )
  )
  SELECT
    available.patient_id,
    available.clinic_id,
    available.clinic_name,
    available.time_zone,
    available.collaborator_id,
    available.collaborator_name,
    available.room_id,
    available.room_name,
    available.appointment_type_id,
    available.appointment_type_name,
    available.starts_at,
    available.ends_at,
    available.default_pre_session_minutes AS pre_session_minutes,
    available.default_post_session_minutes AS post_session_minutes,
    (
      SELECT MIN(
        ABS(EXTRACT(EPOCH FROM (
          CASE
            WHEN appointment.ends_at <= available.starts_at
              THEN available.starts_at - appointment.ends_at
            ELSE appointment.starts_at - available.ends_at
          END
        ))) / 60
      )
      FROM appointments appointment
      WHERE appointment.tenant_id = available.tenant_id
        AND appointment.patient_id = available.patient_id
        AND appointment.deleted_at IS NULL
        AND appointment.status <> 'cancelled'
    )::double precision AS patient_gap_minutes,
    (
      SELECT MIN(
        ABS(EXTRACT(EPOCH FROM (
          CASE
            WHEN appointment.ends_at <= available.starts_at
              THEN available.starts_at - appointment.ends_at
            ELSE appointment.starts_at - available.ends_at
          END
        ))) / 60
      )
      FROM appointments appointment
      WHERE appointment.tenant_id = available.tenant_id
        AND appointment.collaborator_id = available.collaborator_id
        AND appointment.deleted_at IS NULL
        AND appointment.status <> 'cancelled'
    )::double precision AS collaborator_gap_minutes,
    (
      SELECT MIN(
        ABS(EXTRACT(EPOCH FROM (
          CASE
            WHEN appointment.ends_at <= available.starts_at
              THEN available.starts_at - appointment.ends_at
            ELSE appointment.starts_at - available.ends_at
          END
        ))) / 60
      )
      FROM appointments appointment
      WHERE appointment.tenant_id = available.tenant_id
        AND appointment.clinic_id = available.clinic_id
        AND appointment.room_id = available.room_id
        AND appointment.deleted_at IS NULL
        AND appointment.status <> 'cancelled'
    )::double precision AS room_gap_minutes,
    EXISTS (
      SELECT 1
      FROM patient_scheduling_preferences preference
      WHERE preference.tenant_id = available.tenant_id
        AND preference.patient_id = available.patient_id
        AND preference.clinic_id = available.clinic_id
        AND preference.weekday = EXTRACT(DOW FROM available.local_day)
        AND preference.start_time <= available.starts_at AT TIME ZONE available.time_zone
        AND preference.end_time >= available.ends_at AT TIME ZONE available.time_zone
        AND preference.deleted_at IS NULL
    ) AS matches_preference,
    available.collaborator_id = (
      SELECT appointment.collaborator_id
      FROM appointments appointment
      WHERE appointment.tenant_id = available.tenant_id
        AND appointment.patient_id = available.patient_id
        AND appointment.deleted_at IS NULL
        AND appointment.status IN ('scheduled', 'confirmed', 'completed')
      ORDER BY appointment.starts_at DESC
      LIMIT 1
    ) AS keeps_continuity
  FROM available
  ORDER BY available.starts_at, available.collaborator_id, available.room_id
  LIMIT 2000
`;

function mapCandidate(row: CandidateRow): SchedulingCandidate {
  return {
    patientId: row.patient_id,
    clinicId: row.clinic_id,
    clinicName: row.clinic_name,
    timeZone: row.time_zone,
    collaboratorId: row.collaborator_id,
    collaboratorName: row.collaborator_name,
    roomId: row.room_id,
    roomName: row.room_name,
    appointmentTypeId: row.appointment_type_id,
    appointmentTypeName: row.appointment_type_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    preSessionMinutes: row.pre_session_minutes,
    postSessionMinutes: row.post_session_minutes,
    patientGapMinutes: row.patient_gap_minutes,
    collaboratorGapMinutes: row.collaborator_gap_minutes,
    roomGapMinutes: row.room_gap_minutes,
    matchesPreference: row.matches_preference,
    keepsContinuity: row.keeps_continuity
  };
}
