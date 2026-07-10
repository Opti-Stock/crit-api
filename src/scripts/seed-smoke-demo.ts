import "dotenv/config";

import { hash } from "bcrypt";
import type { PoolClient } from "pg";

import { env } from "../config/env.js";
import { pool } from "../config/db.js";
import { withTenantTransaction } from "../shared/db/tenant-transaction.js";

const TENANT_CODE = process.env.DEMO_TENANT_CODE?.trim().toUpperCase() || "CRIT-OCC-01";
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || "DemoPassword123";

const DEMO_USERS = [
  { role: "admin", email: "demo.admin@crit.test", fullName: "Demo Admin" },
  { role: "direccion", email: "demo.direccion@crit.test", fullName: "Demo Direccion" },
  { role: "recepcion", email: "demo.recepcion@crit.test", fullName: "Demo Recepcion" },
  { role: "recepcion_general", email: "demo.recepcion.general@crit.test", fullName: "Demo Recepcion General" },
  { role: "coordinador", email: "demo.coordinador@crit.test", fullName: "Demo Coordinador" },
  { role: "medico", email: "demo.medico@crit.test", fullName: "Demo Medico", specialty: "Medicina fisica" },
  { role: "terapeuta", email: "demo.terapeuta@crit.test", fullName: "Demo Terapeuta", specialty: "Terapia fisica" },
  {
    role: "personal_acompanamiento",
    email: "demo.acompanamiento@crit.test",
    fullName: "Demo Acompanamiento",
    specialty: "Acompanamiento"
  },
  { role: "paciente_familia", email: "demo.familia@crit.test", fullName: "Demo Familia" }
] as const;

interface DemoUser {
  id: string;
  role: string;
  email: string;
  fullName: string;
  collaboratorId?: string;
}

interface DemoClinic {
  id: string;
}

interface DemoRoom {
  id: string;
}

interface DemoPatient {
  id: string;
  fullName: string;
}

interface DemoAppointment {
  id: string;
  patientId: string;
  collaboratorId: string;
}

async function seedSmokeDemo() {
  if (DEMO_PASSWORD.length < 12) {
    throw new Error("DEMO_USER_PASSWORD must be at least 12 characters");
  }

  const tenant = await pool.query<{ id: string; code: string }>(
    `SELECT id, code
     FROM tenants
     WHERE upper(code) = $1 AND status = 'active' AND deleted_at IS NULL
     LIMIT 1`,
    [TENANT_CODE]
  );
  const tenantId = tenant.rows[0]?.id;
  if (!tenantId) throw new Error(`Active tenant ${TENANT_CODE} was not found`);

  const passwordHash = await hash(DEMO_PASSWORD, env.BCRYPT_SALT_ROUNDS);

  const summary = await withTenantTransaction({ tenantId }, async (client) => {
    const roleIds = await loadRoleIds(client, tenantId);
    const clinic = await upsertClinic(client, tenantId);
    const rooms = {
      consultorio: await upsertRoom(client, tenantId, clinic.id, "Consultorio Demo", 2),
      terapia: await upsertRoom(client, tenantId, clinic.id, "Sala Terapia Demo", 4)
    };
    const users = await upsertUsers(client, tenantId, roleIds, clinic.id, passwordHash);
    const patients = {
      therapy: await upsertPatient(client, tenantId, {
        externalId: "DEMO-PAT-001",
        fullName: "Paciente Demo Terapia",
        birthDate: "2014-05-10",
        phone: "5550101001",
        email: "paciente.terapia@crit.test",
        disability: "Motora",
        gender: "No especificado"
      }),
      medical: await upsertPatient(client, tenantId, {
        externalId: "DEMO-PAT-002",
        fullName: "Paciente Demo Medicina",
        birthDate: "2012-09-18",
        phone: "5550101002",
        email: "paciente.medicina@crit.test",
        disability: "Neuromuscular",
        gender: "No especificado"
      }),
      handoff: await upsertPatient(client, tenantId, {
        externalId: "DEMO-PAT-003",
        fullName: "Paciente Demo Enlace",
        birthDate: "2016-01-25",
        phone: "5550101003",
        email: "paciente.enlace@crit.test",
        disability: "Lenguaje",
        gender: "No especificado"
      })
    };

    await linkFamilyUserToPatient(client, tenantId, users.paciente_familia.id, patients.therapy.id);

    const appointmentType = await upsertAppointmentType(client, tenantId);
    const appointments = await upsertAppointments(client, tenantId, {
      actorUserId: users.coordinador.id,
      clinic,
      rooms,
      appointmentTypeId: appointmentType.id,
      patients,
      medicoCollaboratorId: requireCollaborator(users.medico),
      terapeutaCollaboratorId: requireCollaborator(users.terapeuta)
    });

    await upsertCheckIn(client, tenantId, appointments.present, users.recepcion.id);
    const attendance = await upsertAttendance(client, tenantId, appointments.present, users.terapeuta.id, "present", true);
    await upsertAttendance(client, tenantId, appointments.absent, users.medico.id, "absent", false);
    await upsertAttendance(client, tenantId, appointments.rescheduled, users.terapeuta.id, "rescheduled", false);

    await setCurrentUser(client, users.terapeuta.id);
    await upsertMedicalNote(client, tenantId, appointments.present, attendance.id, users.terapeuta.id);

    await setCurrentUser(client, users.personal_acompanamiento.id);
    const handoffNote = await upsertHandoffNote(client, tenantId, {
      appointmentId: appointments.present.id,
      patientId: patients.therapy.id,
      createdByUserId: users.personal_acompanamiento.id,
      recipientUserIds: [
        users.recepcion.id,
        users.coordinador.id,
        users.medico.id,
        users.terapeuta.id,
        users.direccion.id
      ]
    });

    await upsertNotification(client, tenantId, users.terapeuta.id, {
      type: "pending_note",
      title: "Demo: nota medica revisada",
      message: "Notificacion demo para validar el centro de notificaciones."
    });

    return {
      tenant: tenant.rows[0]!.code,
      users: Object.values(users).length,
      patients: Object.values(patients).length,
      appointments: Object.values(appointments).length,
      handoffNoteId: handoffNote.id
    };
  }, pool);

  console.log("Smoke demo seed completed", summary);
  console.log("Demo password for every demo.*@crit.test user:", DEMO_PASSWORD);
}

async function loadRoleIds(client: PoolClient, tenantId: string) {
  const result = await client.query<{ id: string; name: string }>(
    `SELECT id, name FROM roles
     WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );
  const roleIds = new Map(result.rows.map((row) => [row.name, row.id]));
  const missingRoles = DEMO_USERS.map((user) => user.role).filter((role) => !roleIds.has(role));
  if (missingRoles.length) throw new Error(`Missing seeded roles: ${missingRoles.join(", ")}`);
  return roleIds;
}

async function upsertClinic(client: PoolClient, tenantId: string): Promise<DemoClinic> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM clinics
     WHERE tenant_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, "Clinica Demo Smoke"]
  );
  if (existing.rows[0]) return existing.rows[0];

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO clinics (tenant_id, name, specialization, capacity)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [tenantId, "Clinica Demo Smoke", "Rehabilitacion integral", 6]
  );
  return inserted.rows[0]!;
}

async function upsertRoom(
  client: PoolClient,
  tenantId: string,
  clinicId: string,
  name: string,
  capacity: number
): Promise<DemoRoom> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM rooms
     WHERE tenant_id = $1 AND clinic_id = $2 AND lower(name) = lower($3) AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, clinicId, name]
  );
  if (existing.rows[0]) return existing.rows[0];

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO rooms (tenant_id, clinic_id, name, capacity)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [tenantId, clinicId, name, capacity]
  );
  return inserted.rows[0]!;
}

async function upsertUsers(
  client: PoolClient,
  tenantId: string,
  roleIds: Map<string, string>,
  clinicId: string,
  passwordHash: string
) {
  const users: Record<string, DemoUser> = {};

  for (const demoUser of DEMO_USERS) {
    const user = await upsertUser(client, tenantId, {
      fullName: demoUser.fullName,
      email: demoUser.email,
      passwordHash
    });
    const roleId = roleIds.get(demoUser.role)!;
    await client.query(
      `INSERT INTO user_roles (tenant_id, user_id, role_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING`,
      [tenantId, user.id, roleId]
    );

    if (demoUser.role !== "paciente_familia") {
      await client.query(
        `INSERT INTO user_clinic_access (tenant_id, user_id, clinic_id, access_level)
         VALUES ($1, $2, $3, 'standard')
         ON CONFLICT (tenant_id, user_id, clinic_id) DO NOTHING`,
        [tenantId, user.id, clinicId]
      );
      const collaborator = await upsertCollaborator(client, tenantId, user.id, {
        fullName: demoUser.fullName,
        email: demoUser.email,
        specialty: "specialty" in demoUser && demoUser.specialty ? demoUser.specialty : demoUser.role,
        position: demoUser.role
      });
      await client.query(
        `INSERT INTO collaborator_clinics (tenant_id, collaborator_id, clinic_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, collaborator_id, clinic_id) DO NOTHING`,
        [tenantId, collaborator.id, clinicId]
      );
      users[demoUser.role] = { ...user, role: demoUser.role, collaboratorId: collaborator.id };
    } else {
      users[demoUser.role] = { ...user, role: demoUser.role };
    }
  }

  return users as Record<(typeof DEMO_USERS)[number]["role"], DemoUser>;
}

async function upsertUser(
  client: PoolClient,
  tenantId: string,
  input: { fullName: string; email: string; passwordHash: string }
) {
  const email = input.email.toLowerCase();
  const existing = await client.query<{ id: string; full_name: string; email: string }>(
    `SELECT id, full_name, email FROM users
     WHERE tenant_id = $1 AND lower(email) = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, email]
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE users
       SET full_name = $3,
           password_hash = $4,
           status = 'active'
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, existing.rows[0].id, input.fullName, input.passwordHash]
    );
    return { id: existing.rows[0].id, fullName: input.fullName, email };
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO users (tenant_id, full_name, email, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [tenantId, input.fullName, email, input.passwordHash]
  );
  return { id: inserted.rows[0]!.id, fullName: input.fullName, email };
}

async function upsertCollaborator(
  client: PoolClient,
  tenantId: string,
  userId: string,
  input: { fullName: string; email: string; specialty: string; position: string }
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO collaborators (tenant_id, user_id, full_name, email, specialty, position, status, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', NULL)
     ON CONFLICT (user_id) DO UPDATE
     SET full_name = EXCLUDED.full_name,
         email = EXCLUDED.email,
         specialty = EXCLUDED.specialty,
         position = EXCLUDED.position,
         status = 'active',
         deleted_at = NULL
     RETURNING id`,
    [tenantId, userId, input.fullName, input.email, input.specialty, input.position]
  );
  return result.rows[0]!;
}

async function upsertPatient(
  client: PoolClient,
  tenantId: string,
  input: {
    externalId: string;
    fullName: string;
    birthDate: string;
    phone: string;
    email: string;
    disability: string;
    gender: string;
  }
): Promise<DemoPatient> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM patients
     WHERE tenant_id = $1 AND external_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, input.externalId]
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE patients
       SET full_name = $3,
           birth_date = $4,
           phone = $5,
           email = $6,
           disability = $7,
           gender = $8,
           status = 'active'
       WHERE tenant_id = $1 AND id = $2`,
      [
        tenantId,
        existing.rows[0].id,
        input.fullName,
        input.birthDate,
        input.phone,
        input.email,
        input.disability,
        input.gender
      ]
    );
    return { id: existing.rows[0].id, fullName: input.fullName };
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO patients (tenant_id, external_id, full_name, birth_date, phone, email, disability, gender)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      tenantId,
      input.externalId,
      input.fullName,
      input.birthDate,
      input.phone,
      input.email,
      input.disability,
      input.gender
    ]
  );
  return { id: inserted.rows[0]!.id, fullName: input.fullName };
}

async function linkFamilyUserToPatient(
  client: PoolClient,
  tenantId: string,
  userId: string,
  patientId: string
) {
  await client.query(
    `UPDATE patients
     SET user_id = $3
     WHERE tenant_id = $1 AND id = $2 AND (user_id IS NULL OR user_id = $3)`,
    [tenantId, patientId, userId]
  );
}

async function upsertAppointmentType(client: PoolClient, tenantId: string) {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM appointment_types
     WHERE tenant_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, "Terapia Demo"]
  );
  if (existing.rows[0]) return existing.rows[0];

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO appointment_types (
       tenant_id, name, default_duration_minutes, default_pre_session_minutes, default_post_session_minutes
     ) VALUES ($1, $2, 45, 5, 5)
     RETURNING id`,
    [tenantId, "Terapia Demo"]
  );
  return inserted.rows[0]!;
}

async function upsertAppointments(
  client: PoolClient,
  tenantId: string,
  input: {
    actorUserId: string;
    clinic: DemoClinic;
    rooms: { consultorio: DemoRoom; terapia: DemoRoom };
    appointmentTypeId: string;
    patients: { therapy: DemoPatient; medical: DemoPatient; handoff: DemoPatient };
    medicoCollaboratorId: string;
    terapeutaCollaboratorId: string;
  }
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
    present: await upsertAppointment(client, tenantId, {
      patientId: input.patients.therapy.id,
      collaboratorId: input.terapeutaCollaboratorId,
      clinicId: input.clinic.id,
      roomId: input.rooms.terapia.id,
      appointmentTypeId: input.appointmentTypeId,
      startsAt: timeOnDate(today, 9, 0),
      endsAt: timeOnDate(today, 9, 45),
      status: "scheduled",
      actorUserId: input.actorUserId
    }),
    absent: await upsertAppointment(client, tenantId, {
      patientId: input.patients.medical.id,
      collaboratorId: input.medicoCollaboratorId,
      clinicId: input.clinic.id,
      roomId: input.rooms.consultorio.id,
      appointmentTypeId: input.appointmentTypeId,
      startsAt: timeOnDate(today, 10, 0),
      endsAt: timeOnDate(today, 10, 45),
      status: "scheduled",
      actorUserId: input.actorUserId
    }),
    rescheduled: await upsertAppointment(client, tenantId, {
      patientId: input.patients.handoff.id,
      collaboratorId: input.terapeutaCollaboratorId,
      clinicId: input.clinic.id,
      roomId: input.rooms.terapia.id,
      appointmentTypeId: input.appointmentTypeId,
      startsAt: timeOnDate(today, 11, 0),
      endsAt: timeOnDate(today, 11, 45),
      status: "rescheduled",
      actorUserId: input.actorUserId
    })
  };
}

async function upsertAppointment(
  client: PoolClient,
  tenantId: string,
  input: {
    patientId: string;
    collaboratorId: string;
    clinicId: string;
    roomId: string;
    appointmentTypeId: string;
    startsAt: string;
    endsAt: string;
    status: "scheduled" | "rescheduled";
    actorUserId: string;
  }
): Promise<DemoAppointment> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM appointments
     WHERE tenant_id = $1
       AND patient_id = $2
       AND collaborator_id = $3
       AND starts_at = $4
       AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, input.patientId, input.collaboratorId, input.startsAt]
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE appointments
       SET clinic_id = $3,
           room_id = $4,
           appointment_type_id = $5,
           ends_at = $6,
           status = $7,
           updated_by_user_id = $8
       WHERE tenant_id = $1 AND id = $2`,
      [
        tenantId,
        existing.rows[0].id,
        input.clinicId,
        input.roomId,
        input.appointmentTypeId,
        input.endsAt,
        input.status,
        input.actorUserId
      ]
    );
    return { id: existing.rows[0].id, patientId: input.patientId, collaboratorId: input.collaboratorId };
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO appointments (
       tenant_id, patient_id, collaborator_id, clinic_id, room_id, appointment_type_id,
       starts_at, ends_at, pre_session_minutes, post_session_minutes, status, created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 5, 5, $9, $10)
     RETURNING id`,
    [
      tenantId,
      input.patientId,
      input.collaboratorId,
      input.clinicId,
      input.roomId,
      input.appointmentTypeId,
      input.startsAt,
      input.endsAt,
      input.status,
      input.actorUserId
    ]
  );
  return { id: inserted.rows[0]!.id, patientId: input.patientId, collaboratorId: input.collaboratorId };
}

async function upsertCheckIn(
  client: PoolClient,
  tenantId: string,
  appointment: DemoAppointment,
  checkedInByUserId: string
) {
  await client.query(
    `INSERT INTO appointment_check_ins (tenant_id, appointment_id, patient_id, checked_in_by_user_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, appointment_id) DO UPDATE
     SET checked_in_by_user_id = EXCLUDED.checked_in_by_user_id,
         deleted_at = NULL`,
    [tenantId, appointment.id, appointment.patientId, checkedInByUserId]
  );
}

async function upsertAttendance(
  client: PoolClient,
  tenantId: string,
  appointment: DemoAppointment,
  checkedByUserId: string,
  status: "present" | "absent" | "rescheduled",
  notesRequired: boolean
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO attendance_records (
       tenant_id, appointment_id, patient_id, collaborator_id,
       checked_by_user_id, status, checked_at, notes_required
     ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
     ON CONFLICT (tenant_id, appointment_id) DO UPDATE
     SET checked_by_user_id = EXCLUDED.checked_by_user_id,
         status = EXCLUDED.status,
         checked_at = CURRENT_TIMESTAMP,
         notes_required = EXCLUDED.notes_required,
         deleted_at = NULL
     RETURNING id`,
    [
      tenantId,
      appointment.id,
      appointment.patientId,
      appointment.collaboratorId,
      checkedByUserId,
      status,
      notesRequired
    ]
  );
  return result.rows[0]!;
}

async function upsertMedicalNote(
  client: PoolClient,
  tenantId: string,
  appointment: DemoAppointment,
  attendanceRecordId: string,
  createdByUserId: string
) {
  await client.query(
    `INSERT INTO medical_notes (
       tenant_id, attendance_record_id, appointment_id, patient_id, collaborator_id,
       content, format_version, created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'demo-medical-note.v1', $7)
     ON CONFLICT (tenant_id, appointment_id) DO UPDATE
     SET attendance_record_id = EXCLUDED.attendance_record_id,
         content = EXCLUDED.content,
         format_version = EXCLUDED.format_version,
         updated_by_user_id = EXCLUDED.created_by_user_id,
         deleted_at = NULL`,
    [
      tenantId,
      attendanceRecordId,
      appointment.id,
      appointment.patientId,
      appointment.collaboratorId,
      JSON.stringify({
        summary: "Paciente demo asistio a sesion. Se registra tolerancia adecuada al ejercicio.",
        instructions: "Continuar rutina domiciliaria y seguimiento semanal.",
        observations: "Datos de prueba sin contenido clinico real."
      }),
      createdByUserId
    ]
  );
}

async function upsertHandoffNote(
  client: PoolClient,
  tenantId: string,
  input: {
    appointmentId: string;
    patientId: string;
    createdByUserId: string;
    recipientUserIds: string[];
  }
) {
  const title = "Demo: seguimiento operativo";
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM handoff_notes
     WHERE tenant_id = $1
       AND appointment_id = $2
       AND title = $3
       AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, input.appointmentId, title]
  );

  const noteId = existing.rows[0]?.id ?? (
    await client.query<{ id: string }>(
      `INSERT INTO handoff_notes (
         tenant_id, patient_id, appointment_id, created_by_user_id, title, content, priority, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'medium', 'pending')
       RETURNING id`,
      [
        tenantId,
        input.patientId,
        input.appointmentId,
        input.createdByUserId,
        title,
        "Nota de enlace demo para validar historial tipo chat y notificaciones."
      ]
    )
  ).rows[0]!.id;

  await client.query(
    `UPDATE handoff_notes
     SET patient_id = $3,
         created_by_user_id = $4,
         content = $5,
         priority = 'medium',
         status = 'pending'
     WHERE tenant_id = $1 AND id = $2`,
    [
      tenantId,
      noteId,
      input.patientId,
      input.createdByUserId,
      "Nota de enlace demo para validar historial tipo chat y notificaciones."
    ]
  );

  for (const recipientUserId of input.recipientUserIds) {
    await client.query(
      `INSERT INTO handoff_note_recipients (tenant_id, handoff_note_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, handoff_note_id, user_id) DO NOTHING`,
      [tenantId, noteId, recipientUserId]
    );
    await upsertNotification(client, tenantId, recipientUserId, {
      type: "handoff_note_received",
      title: "Demo: nota de enlace",
      message: "Tienes una nota de enlace demo pendiente de lectura."
    });
  }

  return { id: noteId };
}

async function upsertNotification(
  client: PoolClient,
  tenantId: string,
  userId: string,
  input: { type: string; title: string; message: string }
) {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM notifications
     WHERE tenant_id = $1
       AND user_id = $2
       AND type = $3
       AND title = $4
     LIMIT 1`,
    [tenantId, userId, input.type, input.title]
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE notifications
       SET message = $5,
           read_at = NULL
       WHERE tenant_id = $1 AND id = $2 AND user_id = $3 AND type = $4`,
      [tenantId, existing.rows[0].id, userId, input.type, input.message]
    );
    return;
  }

  await client.query(
    `INSERT INTO notifications (tenant_id, user_id, type, title, message)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, userId, input.type, input.title, input.message]
  );
}

async function setCurrentUser(client: PoolClient, userId: string) {
  await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
}

function requireCollaborator(user: DemoUser) {
  if (!user.collaboratorId) throw new Error(`Demo user ${user.email} does not have a collaborator`);
  return user.collaboratorId;
}

function timeOnDate(date: Date, hour: number, minute: number) {
  const value = new Date(date);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
}

seedSmokeDemo()
  .catch((error: unknown) => {
    console.error("Smoke demo seed failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error"
    });
    process.exitCode = 1;
  })
  .finally(() => pool.end());
