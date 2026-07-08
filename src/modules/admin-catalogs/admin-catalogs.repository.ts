import type { Pool, PoolClient } from "pg";

import { pool } from "../../config/db.js";
import { withTenantTransaction } from "../../shared/db/tenant-transaction.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../shared/errors/app-error.js";
import type {
  CreateAppointmentTypeInput,
  CreateClinicInput,
  CreateCollaboratorInput,
  CreatePatientInput,
  CreateRoomInput,
  UpdateAppointmentTypeInput,
  UpdateClinicInput,
  UpdateCollaboratorInput,
  UpdatePatientInput,
  UpdateRoomInput
} from "./admin-catalogs.validation.js";

export class AdminCatalogsRepository {
  constructor(private readonly databasePool: Pool = pool) {}

  listClinics(tenantId: string, actorId: string) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const result = await client.query(
        `SELECT id, name, specialization, capacity, coordinator_id AS "coordinatorId", status
         FROM clinics
         WHERE tenant_id = $1 AND deleted_at IS NULL
         ORDER BY name`,
        [tenantId]
      );
      return result.rows;
    }, this.databasePool);
  }

  createClinic(tenantId: string, actorId: string, input: CreateClinicInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      try {
        const result = await client.query(
          `INSERT INTO clinics (tenant_id, name, specialization, capacity, coordinator_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, specialization, capacity, coordinator_id AS "coordinatorId", status`,
          [tenantId, input.name, input.specialization ?? null, input.capacity ?? null, input.coordinatorId ?? null]
        );
        return result.rows[0];
      } catch (error) {
        throw mapCatalogError(error);
      }
    }, this.databasePool);
  }

  updateClinic(tenantId: string, actorId: string, id: string, input: UpdateClinicInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      try {
        const result = await client.query(
          `UPDATE clinics
           SET name = COALESCE($3, name),
               specialization = COALESCE($4, specialization),
               capacity = COALESCE($5, capacity),
               coordinator_id = COALESCE($6, coordinator_id),
               status = COALESCE($7, status)
           WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
           RETURNING id, name, specialization, capacity, coordinator_id AS "coordinatorId", status`,
          [tenantId, id, input.name ?? null, input.specialization ?? null, input.capacity ?? null, input.coordinatorId ?? null, input.status ?? null]
        );
        return requireRow(result.rows[0], "Clinic not found", "CLINIC_NOT_FOUND");
      } catch (error) {
        throw mapCatalogError(error);
      }
    }, this.databasePool);
  }

  softDeleteClinic(tenantId: string, actorId: string, id: string) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const result = await client.query(
        `UPDATE clinics
         SET status = 'inactive',
             deleted_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
         RETURNING id`,
        [tenantId, id]
      );
      requireRow(result.rows[0], "Clinic not found", "CLINIC_NOT_FOUND");

      await client.query(
        `UPDATE rooms
         SET status = 'inactive',
             deleted_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
        [tenantId, id]
      );
    }, this.databasePool);
  }

  listPatients(tenantId: string, actorId: string) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const result = await client.query(
        `SELECT id, full_name AS "fullName", external_id AS "externalId", birth_date AS "birthDate",
                phone, email, disability, gender, status
         FROM patients
         WHERE tenant_id = $1 AND deleted_at IS NULL
         ORDER BY full_name`,
        [tenantId]
      );
      return result.rows;
    }, this.databasePool);
  }

  createPatient(tenantId: string, actorId: string, input: CreatePatientInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      try {
        const result = await client.query(
          `INSERT INTO patients (tenant_id, full_name, birth_date, external_id, phone, email, disability, gender)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, full_name AS "fullName", external_id AS "externalId", birth_date AS "birthDate",
                     phone, email, disability, gender, status`,
          [tenantId, input.fullName, input.birthDate, input.externalId ?? null, input.phone ?? null, input.email ?? null, input.disability ?? null, input.gender ?? null]
        );
        return result.rows[0];
      } catch (error) {
        throw mapCatalogError(error);
      }
    }, this.databasePool);
  }

  updatePatient(tenantId: string, actorId: string, id: string, input: UpdatePatientInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      try {
        const result = await client.query(
          `UPDATE patients
           SET full_name = COALESCE($3, full_name),
               birth_date = COALESCE($4, birth_date),
               external_id = COALESCE($5, external_id),
               phone = COALESCE($6, phone),
               email = COALESCE($7, email),
               disability = COALESCE($8, disability),
               gender = COALESCE($9, gender),
               status = COALESCE($10, status)
           WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
           RETURNING id, full_name AS "fullName", external_id AS "externalId", birth_date AS "birthDate",
                     phone, email, disability, gender, status`,
          [
            tenantId,
            id,
            input.fullName ?? null,
            input.birthDate ?? null,
            input.externalId ?? null,
            input.phone ?? null,
            input.email ?? null,
            input.disability ?? null,
            input.gender ?? null,
            input.status ?? null
          ]
        );
        return requireRow(result.rows[0], "Patient not found", "PATIENT_NOT_FOUND");
      } catch (error) {
        throw mapCatalogError(error);
      }
    }, this.databasePool);
  }

  listRooms(tenantId: string, actorId: string) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const result = await client.query(
        `SELECT r.id, r.clinic_id AS "clinicId", c.name AS "clinicName", r.name, r.capacity, r.status
         FROM rooms r
         JOIN clinics c ON c.tenant_id = r.tenant_id AND c.id = r.clinic_id AND c.deleted_at IS NULL
         WHERE r.tenant_id = $1 AND r.deleted_at IS NULL
         ORDER BY c.name, r.name`,
        [tenantId]
      );
      return result.rows;
    }, this.databasePool);
  }

  createRoom(tenantId: string, actorId: string, input: CreateRoomInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      try {
        const result = await client.query(
          `INSERT INTO rooms (tenant_id, clinic_id, name, capacity)
           VALUES ($1, $2, $3, $4)
           RETURNING id, clinic_id AS "clinicId", name, capacity, status`,
          [tenantId, input.clinicId, input.name, input.capacity ?? null]
        );
        return result.rows[0];
      } catch (error) {
        throw mapCatalogError(error);
      }
    }, this.databasePool);
  }

  updateRoom(tenantId: string, actorId: string, id: string, input: UpdateRoomInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      try {
        const result = await client.query(
          `UPDATE rooms
           SET clinic_id = COALESCE($3, clinic_id),
               name = COALESCE($4, name),
               capacity = COALESCE($5, capacity),
               status = COALESCE($6, status)
           WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
           RETURNING id, clinic_id AS "clinicId", name, capacity, status`,
          [tenantId, id, input.clinicId ?? null, input.name ?? null, input.capacity ?? null, input.status ?? null]
        );
        return requireRow(result.rows[0], "Room not found", "ROOM_NOT_FOUND");
      } catch (error) {
        throw mapCatalogError(error);
      }
    }, this.databasePool);
  }

  softDeleteRoom(tenantId: string, actorId: string, id: string) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const result = await client.query(
        `UPDATE rooms
         SET status = 'inactive',
             deleted_at = CURRENT_TIMESTAMP
         WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
         RETURNING id`,
        [tenantId, id]
      );
      requireRow(result.rows[0], "Room not found", "ROOM_NOT_FOUND");
    }, this.databasePool);
  }

  listAppointmentTypes(tenantId: string, actorId: string) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const result = await client.query(
        `SELECT id, name,
                default_duration_minutes AS "defaultDurationMinutes",
                default_pre_session_minutes AS "defaultPreSessionMinutes",
                default_post_session_minutes AS "defaultPostSessionMinutes"
         FROM appointment_types
         WHERE tenant_id = $1 AND deleted_at IS NULL
         ORDER BY name`,
        [tenantId]
      );
      return result.rows;
    }, this.databasePool);
  }

  createAppointmentType(tenantId: string, actorId: string, input: CreateAppointmentTypeInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      try {
        const result = await client.query(
          `INSERT INTO appointment_types (
             tenant_id, name, default_duration_minutes, default_pre_session_minutes, default_post_session_minutes
           ) VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name,
                     default_duration_minutes AS "defaultDurationMinutes",
                     default_pre_session_minutes AS "defaultPreSessionMinutes",
                     default_post_session_minutes AS "defaultPostSessionMinutes"`,
          [
            tenantId,
            input.name,
            input.defaultDurationMinutes,
            input.defaultPreSessionMinutes,
            input.defaultPostSessionMinutes
          ]
        );
        return result.rows[0];
      } catch (error) {
        throw mapCatalogError(error);
      }
    }, this.databasePool);
  }

  updateAppointmentType(tenantId: string, actorId: string, id: string, input: UpdateAppointmentTypeInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      try {
        const result = await client.query(
          `UPDATE appointment_types
           SET name = COALESCE($3, name),
               default_duration_minutes = COALESCE($4, default_duration_minutes),
               default_pre_session_minutes = COALESCE($5, default_pre_session_minutes),
               default_post_session_minutes = COALESCE($6, default_post_session_minutes)
           WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
           RETURNING id, name,
                     default_duration_minutes AS "defaultDurationMinutes",
                     default_pre_session_minutes AS "defaultPreSessionMinutes",
                     default_post_session_minutes AS "defaultPostSessionMinutes"`,
          [
            tenantId,
            id,
            input.name ?? null,
            input.defaultDurationMinutes ?? null,
            input.defaultPreSessionMinutes ?? null,
            input.defaultPostSessionMinutes ?? null
          ]
        );
        return requireRow(result.rows[0], "Appointment type not found", "APPOINTMENT_TYPE_NOT_FOUND");
      } catch (error) {
        throw mapCatalogError(error);
      }
    }, this.databasePool);
  }

  listCollaborators(tenantId: string, actorId: string) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const result = await client.query(
        `SELECT c.id, c.user_id AS "userId", c.full_name AS "fullName", c.external_id AS "externalId",
                c.phone, c.email, c.specialty, c.gender, c.position, c.status,
                COALESCE(
                  (SELECT jsonb_agg(cc.clinic_id ORDER BY cc.clinic_id)
                   FROM collaborator_clinics cc
                   WHERE cc.tenant_id = c.tenant_id AND cc.collaborator_id = c.id),
                  '[]'::jsonb
                ) AS "clinicIds"
         FROM collaborators c
         WHERE c.tenant_id = $1 AND c.deleted_at IS NULL
         ORDER BY c.full_name`,
        [tenantId]
      );
      return result.rows;
    }, this.databasePool);
  }

  createCollaborator(tenantId: string, actorId: string, input: CreateCollaboratorInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      try {
        await this.validateClinicIds(client, tenantId, input.clinicIds);
        const result = await client.query<{ id: string }>(
          `INSERT INTO collaborators (
             tenant_id, user_id, full_name, specialty, external_id, phone, email, gender, position
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            tenantId,
            input.userId,
            input.fullName,
            input.specialty,
            input.externalId ?? null,
            input.phone ?? null,
            input.email ?? null,
            input.gender ?? null,
            input.position ?? null
          ]
        );
        await this.replaceCollaboratorClinics(client, tenantId, result.rows[0]!.id, input.clinicIds);
        return this.findCollaborator(client, tenantId, result.rows[0]!.id);
      } catch (error) {
        throw mapCatalogError(error);
      }
    }, this.databasePool);
  }

  updateCollaborator(tenantId: string, actorId: string, id: string, input: UpdateCollaboratorInput) {
    return withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      try {
        if (input.clinicIds) await this.validateClinicIds(client, tenantId, input.clinicIds);
        const result = await client.query(
          `UPDATE collaborators
           SET full_name = COALESCE($3, full_name),
               specialty = COALESCE($4, specialty),
               external_id = COALESCE($5, external_id),
               phone = COALESCE($6, phone),
               email = COALESCE($7, email),
               gender = COALESCE($8, gender),
               position = COALESCE($9, position),
               status = COALESCE($10, status)
           WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
           RETURNING id`,
          [
            tenantId,
            id,
            input.fullName ?? null,
            input.specialty ?? null,
            input.externalId ?? null,
            input.phone ?? null,
            input.email ?? null,
            input.gender ?? null,
            input.position ?? null,
            input.status ?? null
          ]
        );
        requireRow(result.rows[0], "Collaborator not found", "COLLABORATOR_NOT_FOUND");
        if (input.clinicIds) await this.replaceCollaboratorClinics(client, tenantId, id, input.clinicIds);
        return this.findCollaborator(client, tenantId, id);
      } catch (error) {
        throw mapCatalogError(error);
      }
    }, this.databasePool);
  }

  private async findCollaborator(client: PoolClient, tenantId: string, collaboratorId: string) {
    const result = await client.query(
      `SELECT c.id, c.user_id AS "userId", c.full_name AS "fullName", c.external_id AS "externalId",
              c.phone, c.email, c.specialty, c.gender, c.position, c.status,
              COALESCE(
                (SELECT jsonb_agg(cc.clinic_id ORDER BY cc.clinic_id)
                 FROM collaborator_clinics cc
                 WHERE cc.tenant_id = c.tenant_id AND cc.collaborator_id = c.id),
                '[]'::jsonb
              ) AS "clinicIds"
       FROM collaborators c
       WHERE c.tenant_id = $1 AND c.id = $2 AND c.deleted_at IS NULL`,
      [tenantId, collaboratorId]
    );
    return requireRow(result.rows[0], "Collaborator not found", "COLLABORATOR_NOT_FOUND");
  }

  private async validateClinicIds(client: PoolClient, tenantId: string, clinicIds: string[]) {
    if (new Set(clinicIds).size !== clinicIds.length) {
      throw new BadRequestError("Clinic assignments must be unique", "DUPLICATE_CLINIC_ASSIGNMENT");
    }
    if (!clinicIds.length) return;
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM clinics
       WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
      [tenantId, clinicIds]
    );
    if (Number(result.rows[0]?.count ?? 0) !== clinicIds.length) {
      throw new BadRequestError("Invalid clinic assignment", "INVALID_CLINIC_ASSIGNMENT");
    }
  }

  private async replaceCollaboratorClinics(
    client: PoolClient,
    tenantId: string,
    collaboratorId: string,
    clinicIds: string[]
  ) {
    await client.query(
      "DELETE FROM collaborator_clinics WHERE tenant_id = $1 AND collaborator_id = $2",
      [tenantId, collaboratorId]
    );
    for (const clinicId of clinicIds) {
      await client.query(
        `INSERT INTO collaborator_clinics (tenant_id, collaborator_id, clinic_id)
         VALUES ($1, $2, $3)`,
        [tenantId, collaboratorId, clinicId]
      );
    }
  }
}

function requireRow<TRow>(row: TRow | undefined, message: string, code: string): TRow {
  if (!row) throw new NotFoundError(message, code);
  return row;
}

function mapCatalogError(error: unknown): Error {
  if (
    error instanceof BadRequestError ||
    error instanceof ConflictError ||
    error instanceof NotFoundError
  ) {
    return error;
  }

  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
  if (code === "23505") return new ConflictError("Catalog record already exists", "CATALOG_CONFLICT");
  if (code === "23503" || code === "23514") {
    return new BadRequestError("Catalog record violates a data constraint", "INVALID_CATALOG_DATA");
  }
  return error instanceof Error ? error : new Error("Unknown database error");
}
