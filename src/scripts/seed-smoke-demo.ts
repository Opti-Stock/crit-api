import "dotenv/config";

import { hash } from "bcrypt";
import type { PoolClient } from "pg";

import { env } from "../config/env.js";
import { pool } from "../config/db.js";
import { withTenantTransaction } from "../shared/db/tenant-transaction.js";

const TENANT_CODE = process.env.DEMO_TENANT_CODE?.trim().toUpperCase() || "CRIT-OCC-01";
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || "DemoPassword123";
const DEMO_YEAR = Number(process.env.DEMO_YEAR || "2026");

const DEMO_CLINICS = [
  {
    key: "norte",
    name: "Smoke Norte Medicina",
    specialization: "Medicina fisica y rehabilitacion",
    capacity: 6,
    rooms: [
      { key: "norte-consultorio-1", name: "Smoke Norte Consultorio 1", capacity: 1 },
      { key: "norte-consultorio-2", name: "Smoke Norte Consultorio 2", capacity: 1 },
      { key: "norte-sala-terapia", name: "Smoke Norte Sala Terapia", capacity: 4 }
    ]
  },
  {
    key: "sur",
    name: "Smoke Sur Terapia",
    specialization: "Terapia fisica y ocupacional",
    capacity: 8,
    rooms: [
      { key: "sur-consultorio", name: "Smoke Sur Consultorio", capacity: 1 },
      { key: "sur-terapia-a", name: "Smoke Sur Terapia A", capacity: 3 },
      { key: "sur-terapia-b", name: "Smoke Sur Terapia B", capacity: 4 }
    ]
  },
  {
    key: "infantil",
    name: "Smoke Infantil Lenguaje",
    specialization: "Lenguaje y neurodesarrollo",
    capacity: 5,
    rooms: [
      { key: "infantil-lenguaje", name: "Smoke Infantil Lenguaje", capacity: 2 },
      { key: "infantil-estimulacion", name: "Smoke Infantil Estimulacion", capacity: 3 }
    ]
  }
] as const;

const DEMO_USERS = [
  { key: "admin", role: "admin", email: "demo.admin@crit.test", fullName: "Demo Admin General", clinicKeys: ["all"] },
  { key: "direccion", role: "direccion", email: "demo.direccion@crit.test", fullName: "Demo Direccion Todas Clinicas", clinicKeys: ["all"] },
  {
    key: "recepcion_general",
    role: "recepcion_general",
    email: "demo.recepcion.general@crit.test",
    fullName: "Demo Recepcion General Checkin Global",
    clinicKeys: ["all"]
  },
  {
    key: "recepcion_norte",
    role: "recepcion",
    email: "demo.recepcion.norte@crit.test",
    fullName: "Demo Recepcion Norte",
    clinicKeys: ["norte"]
  },
  {
    key: "recepcion_sur",
    role: "recepcion",
    email: "demo.recepcion.sur@crit.test",
    fullName: "Demo Recepcion Sur",
    clinicKeys: ["sur"]
  },
  {
    key: "recepcion_infantil",
    role: "recepcion",
    email: "demo.recepcion.infantil@crit.test",
    fullName: "Demo Recepcion Infantil",
    clinicKeys: ["infantil"]
  },
  {
    key: "coordinador_norte",
    role: "coordinador",
    email: "demo.coordinador.norte@crit.test",
    fullName: "Demo Coordinador Norte",
    specialty: "Coordinacion medicina fisica",
    clinicKeys: ["norte"]
  },
  {
    key: "coordinador_sur",
    role: "coordinador",
    email: "demo.coordinador.sur@crit.test",
    fullName: "Demo Coordinador Sur",
    specialty: "Coordinacion terapia fisica",
    clinicKeys: ["sur"]
  },
  {
    key: "medico_norte",
    role: "medico",
    email: "demo.medico.norte@crit.test",
    fullName: "Demo Medico Norte",
    specialty: "Medicina fisica norte",
    clinicKeys: ["norte"]
  },
  {
    key: "medico_multi",
    role: "medico",
    email: "demo.medico.multi@crit.test",
    fullName: "Demo Medico Multi Clinica",
    specialty: "Medicina fisica multi clinica",
    clinicKeys: ["norte", "sur", "infantil"]
  },
  {
    key: "terapeuta_sur",
    role: "terapeuta",
    email: "demo.terapeuta.sur@crit.test",
    fullName: "Demo Terapeuta Sur",
    specialty: "Terapia fisica sur",
    clinicKeys: ["sur"]
  },
  {
    key: "terapeuta_infantil",
    role: "terapeuta",
    email: "demo.terapeuta.infantil@crit.test",
    fullName: "Demo Terapeuta Infantil",
    specialty: "Terapia lenguaje infantil",
    clinicKeys: ["infantil"]
  },
  {
    key: "acompanamiento_norte",
    role: "personal_acompanamiento",
    email: "demo.acompanamiento.norte@crit.test",
    fullName: "Demo AP Norte",
    specialty: "Acompanamiento norte",
    clinicKeys: ["norte"]
  },
  {
    key: "acompanamiento_sur",
    role: "personal_acompanamiento",
    email: "demo.acompanamiento.sur@crit.test",
    fullName: "Demo AP Sur",
    specialty: "Acompanamiento sur",
    clinicKeys: ["sur"]
  },
  {
    key: "familia",
    role: "paciente_familia",
    email: "demo.familia@crit.test",
    fullName: "Demo Familia Paciente Norte",
    clinicKeys: []
  },
  // Backward-compatible aliases used by earlier smoke docs.
  { key: "recepcion_legacy", role: "recepcion", email: "demo.recepcion@crit.test", fullName: "Demo Recepcion Legacy Norte", clinicKeys: ["norte"] },
  {
    key: "coordinador_legacy",
    role: "coordinador",
    email: "demo.coordinador@crit.test",
    fullName: "Demo Coordinador Legacy Norte",
    specialty: "Coordinacion legacy",
    clinicKeys: ["norte"]
  },
  {
    key: "medico_legacy",
    role: "medico",
    email: "demo.medico@crit.test",
    fullName: "Demo Medico Legacy Norte",
    specialty: "Medicina fisica legacy",
    clinicKeys: ["norte"]
  },
  {
    key: "terapeuta_legacy",
    role: "terapeuta",
    email: "demo.terapeuta@crit.test",
    fullName: "Demo Terapeuta Legacy Sur",
    specialty: "Terapia fisica legacy",
    clinicKeys: ["sur"]
  },
  {
    key: "acompanamiento_legacy",
    role: "personal_acompanamiento",
    email: "demo.acompanamiento@crit.test",
    fullName: "Demo Acompanamiento Legacy",
    specialty: "Acompanamiento legacy",
    clinicKeys: ["norte"]
  }
] as const;

const DEMO_PATIENTS = [
  {
    key: "norte_asiste",
    externalId: "DEMO-PAT-NORTE-001",
    fullName: "Paciente Smoke Norte Asistencia",
    birthDate: "2014-05-10",
    phone: "5550101001",
    email: "paciente.norte.asistencia@crit.test",
    disability: "Motora",
    gender: "No especificado"
  },
  {
    key: "norte_falta",
    externalId: "DEMO-PAT-NORTE-002",
    fullName: "Paciente Smoke Norte Inasistencia",
    birthDate: "2012-09-18",
    phone: "5550101002",
    email: "paciente.norte.inasistencia@crit.test",
    disability: "Neuromuscular",
    gender: "No especificado"
  },
  {
    key: "sur_checkin",
    externalId: "DEMO-PAT-SUR-001",
    fullName: "Paciente Smoke Sur Checkin Pendiente Asistencia",
    birthDate: "2015-03-12",
    phone: "5550101003",
    email: "paciente.sur.checkin@crit.test",
    disability: "Motora",
    gender: "No especificado"
  },
  {
    key: "sur_reagenda",
    externalId: "DEMO-PAT-SUR-002",
    fullName: "Paciente Smoke Sur Solicitud Reagendar",
    birthDate: "2011-11-08",
    phone: "5550101004",
    email: "paciente.sur.reagenda@crit.test",
    disability: "Visual",
    gender: "No especificado"
  },
  {
    key: "infantil_lenguaje",
    externalId: "DEMO-PAT-INF-001",
    fullName: "Paciente Smoke Infantil Lenguaje",
    birthDate: "2017-02-20",
    phone: "5550101005",
    email: "paciente.infantil.lenguaje@crit.test",
    disability: "Lenguaje",
    gender: "No especificado"
  },
  {
    key: "infantil_futuro",
    externalId: "DEMO-PAT-INF-002",
    fullName: "Paciente Smoke Infantil Futuro",
    birthDate: "2018-07-01",
    phone: "5550101006",
    email: "paciente.infantil.futuro@crit.test",
    disability: "Neurodesarrollo",
    gender: "No especificado"
  },
  {
    key: "cancelada",
    externalId: "DEMO-PAT-CAN-001",
    fullName: "Paciente Smoke Cita Cancelada",
    birthDate: "2013-12-02",
    phone: "5550101007",
    email: "paciente.cancelada@crit.test",
    disability: "Auditiva",
    gender: "No especificado"
  },
  {
    key: "sin_citas",
    externalId: "DEMO-PAT-SIN-001",
    fullName: "Paciente Smoke Valido Sin Citas",
    birthDate: "2016-10-15",
    phone: "5550101008",
    email: "paciente.sin.citas@crit.test",
    disability: "Motora",
    gender: "No especificado"
  }
] as const;

const DEMO_APPOINTMENT_TYPES = [
  { key: "medicina", name: "Smoke Medicina Fisica", duration: 45 },
  { key: "terapia_fisica", name: "Smoke Terapia Fisica", duration: 50 },
  { key: "lenguaje", name: "Smoke Terapia Lenguaje", duration: 40 },
  { key: "valoracion", name: "Smoke Valoracion Inicial", duration: 60 }
] as const;

type DemoUserKey = (typeof DEMO_USERS)[number]["key"];
type DemoClinicKey = (typeof DEMO_CLINICS)[number]["key"];
type DemoRoomKey = (typeof DEMO_CLINICS)[number]["rooms"][number]["key"];
type DemoPatientKey = (typeof DEMO_PATIENTS)[number]["key"];
type DemoAppointmentTypeKey = (typeof DEMO_APPOINTMENT_TYPES)[number]["key"];

interface DemoAppointmentConfig {
  key: string;
  patientKey: DemoPatientKey;
  userKey: DemoUserKey;
  clinicKey: DemoClinicKey;
  roomKey: DemoRoomKey;
  typeKey: DemoAppointmentTypeKey;
  date: string;
  time: string;
  duration: number;
  status: "scheduled" | "rescheduled" | "cancelled";
  checkIn: boolean;
  attendance?: "present" | "absent" | "rescheduled";
  medicalNote?: boolean;
  handoff?: boolean;
}

const DEMO_APPOINTMENTS: readonly DemoAppointmentConfig[] = [
  {
    key: "junio_presente_norte",
    patientKey: "norte_asiste",
    userKey: "medico_norte",
    clinicKey: "norte",
    roomKey: "norte-consultorio-1",
    typeKey: "medicina",
    date: "06-03",
    time: "09:00",
    duration: 45,
    status: "scheduled",
    checkIn: true,
    attendance: "present",
    medicalNote: true,
    handoff: true
  },
  {
    key: "junio_falta_norte",
    patientKey: "norte_falta",
    userKey: "medico_multi",
    clinicKey: "norte",
    roomKey: "norte-consultorio-2",
    typeKey: "valoracion",
    date: "06-10",
    time: "10:30",
    duration: 60,
    status: "scheduled",
    checkIn: false,
    attendance: "absent",
    medicalNote: false,
    handoff: true
  },
  {
    key: "junio_cancelada_sur",
    patientKey: "cancelada",
    userKey: "terapeuta_sur",
    clinicKey: "sur",
    roomKey: "sur-terapia-a",
    typeKey: "terapia_fisica",
    date: "06-18",
    time: "12:00",
    duration: 50,
    status: "cancelled",
    checkIn: false
  },
  {
    key: "julio_checkin_sur",
    patientKey: "sur_checkin",
    userKey: "terapeuta_sur",
    clinicKey: "sur",
    roomKey: "sur-terapia-a",
    typeKey: "terapia_fisica",
    date: "07-10",
    time: "09:00",
    duration: 50,
    status: "scheduled",
    checkIn: true
  },
  {
    key: "julio_reagendar_sur",
    patientKey: "sur_reagenda",
    userKey: "terapeuta_sur",
    clinicKey: "sur",
    roomKey: "sur-terapia-b",
    typeKey: "terapia_fisica",
    date: "07-10",
    time: "11:00",
    duration: 50,
    status: "rescheduled",
    checkIn: true,
    attendance: "rescheduled",
    handoff: true
  },
  {
    key: "julio_lenguaje_infantil",
    patientKey: "infantil_lenguaje",
    userKey: "terapeuta_infantil",
    clinicKey: "infantil",
    roomKey: "infantil-lenguaje",
    typeKey: "lenguaje",
    date: "07-16",
    time: "13:00",
    duration: 40,
    status: "scheduled",
    checkIn: false
  },
  {
    key: "julio_multi_medico",
    patientKey: "norte_asiste",
    userKey: "medico_multi",
    clinicKey: "infantil",
    roomKey: "infantil-estimulacion",
    typeKey: "valoracion",
    date: "07-22",
    time: "08:30",
    duration: 60,
    status: "scheduled",
    checkIn: false,
    medicalNote: false
  },
  {
    key: "agosto_futuro_infantil",
    patientKey: "infantil_futuro",
    userKey: "terapeuta_infantil",
    clinicKey: "infantil",
    roomKey: "infantil-lenguaje",
    typeKey: "lenguaje",
    date: "08-05",
    time: "09:30",
    duration: 40,
    status: "scheduled",
    checkIn: false
  },
  {
    key: "agosto_futuro_norte",
    patientKey: "norte_falta",
    userKey: "medico_norte",
    clinicKey: "norte",
    roomKey: "norte-consultorio-1",
    typeKey: "medicina",
    date: "08-14",
    time: "10:00",
    duration: 45,
    status: "scheduled",
    checkIn: false
  },
  {
    key: "agosto_reprogramada_sur",
    patientKey: "sur_reagenda",
    userKey: "medico_multi",
    clinicKey: "sur",
    roomKey: "sur-consultorio",
    typeKey: "valoracion",
    date: "08-28",
    time: "12:30",
    duration: 60,
    status: "rescheduled",
    checkIn: false
  }
] as const;

const WEEKLY_APPOINTMENT_TEMPLATES = [
  {
    suffix: "norte-med",
    patientKey: "norte_asiste",
    userKey: "medico_norte",
    clinicKey: "norte",
    roomKey: "norte-consultorio-1",
    typeKey: "medicina",
    time: "08:00",
    duration: 45
  },
  {
    suffix: "sur-terapia",
    patientKey: "sur_checkin",
    userKey: "terapeuta_sur",
    clinicKey: "sur",
    roomKey: "sur-terapia-a",
    typeKey: "terapia_fisica",
    time: "10:00",
    duration: 50
  },
  {
    suffix: "infantil-lenguaje",
    patientKey: "infantil_lenguaje",
    userKey: "terapeuta_infantil",
    clinicKey: "infantil",
    roomKey: "infantil-lenguaje",
    typeKey: "lenguaje",
    time: "12:00",
    duration: 40
  }
] as const satisfies readonly (Omit<DemoAppointmentConfig, "key" | "date" | "status" | "checkIn" | "attendance" | "medicalNote" | "handoff"> & {
  suffix: string;
})[];

interface DemoUser {
  id: string;
  key: string;
  role: string;
  email: string;
  fullName: string;
  collaboratorId?: string;
}

interface DemoClinic {
  id: string;
  key: string;
  name: string;
}

interface DemoRoom {
  id: string;
  key: string;
  clinicKey: string;
}

interface DemoPatient {
  id: string;
  key: string;
  fullName: string;
}

interface DemoAppointment {
  id: string;
  key: string;
  patientId: string;
  patientName: string;
  collaboratorId: string;
  clinicId: string;
  startsAt: string;
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
    const clinics = await upsertClinics(client, tenantId);
    const rooms = await upsertRooms(client, tenantId, clinics);
    const users = await upsertUsers(client, tenantId, roleIds, clinics, passwordHash);
    const patients = await upsertPatients(client, tenantId);
    const appointmentTypes = await upsertAppointmentTypes(client, tenantId);
    const appointmentConfigs = getDemoAppointmentConfigs();

    await linkFamilyUserToPatient(client, tenantId, users.familia.id, patients.norte_asiste.id);

    const appointments = await upsertAppointments(client, tenantId, {
      actorUserId: users.coordinador_norte.id,
      clinics,
      rooms,
      appointmentTypes,
      patients,
      users,
      appointmentConfigs
    });

    const attendanceRecords: DemoAppointment[] = [];
    for (const appointmentConfig of appointmentConfigs) {
      const appointment = appointments[appointmentConfig.key];
      if (appointmentConfig.checkIn) {
        await upsertCheckIn(client, tenantId, appointment, users.recepcion_general.id);
      }
      const attendanceStatus = appointmentConfig.attendance;
      const requiresMedicalNote = appointmentConfig.medicalNote === true;
      if (attendanceStatus) {
        await upsertAttendance(
          client,
          tenantId,
          appointment,
          users[appointmentConfig.userKey].id,
          attendanceStatus,
          requiresMedicalNote
        );
        attendanceRecords.push(appointment);
      }
    }

    for (const appointmentConfig of appointmentConfigs.filter((appointment) => appointment.medicalNote)) {
      const appointment = appointments[appointmentConfig.key];
      const attendanceStatus = appointmentConfig.attendance ?? "present";
      const attendance = await upsertAttendance(
        client,
        tenantId,
        appointment,
        users[appointmentConfig.userKey].id,
        attendanceStatus,
        true
      );
      await setCurrentUser(client, users[appointmentConfig.userKey].id);
      await upsertMedicalNote(client, tenantId, appointment, attendance.id, users[appointmentConfig.userKey].id, appointmentConfig.key);
    }

    const handoffRecipients = [
      users.recepcion_norte.id,
      users.recepcion_sur.id,
      users.recepcion_general.id,
      users.coordinador_norte.id,
      users.coordinador_sur.id,
      users.medico_norte.id,
      users.medico_multi.id,
      users.terapeuta_sur.id,
      users.terapeuta_infantil.id,
      users.direccion.id
    ];

    for (const appointmentConfig of appointmentConfigs.filter((appointment) => appointment.handoff)) {
      await setCurrentUser(client, users.acompanamiento_norte.id);
      await upsertHandoffNote(client, tenantId, {
        appointment: appointments[appointmentConfig.key],
        title: `Smoke enlace ${appointmentConfig.key}`,
        createdByUserId: users.acompanamiento_norte.id,
        recipientUserIds: handoffRecipients
      });
    }

    await upsertNotification(client, tenantId, users.terapeuta_sur.id, {
      type: "pending_note",
      title: "Smoke: nota medica pendiente",
      message: "Notificacion demo para validar contador de terapeuta.",
      metadata: buildAppointmentNotificationMetadata(appointments.junio_presente_norte, "pending_note")
    });
    await upsertNotification(client, tenantId, users.recepcion_general.id, {
      type: "appointment_change",
      title: "Smoke: solicitud de reagendar",
      message: "Notificacion demo para recepcion general.",
      metadata: buildAppointmentNotificationMetadata(appointments.julio_reagendar_sur, "reschedule")
    });

    return {
      tenant: tenant.rows[0]!.code,
      users: Object.values(users).length,
      clinics: Object.values(clinics).length,
      rooms: Object.values(rooms).length,
      patients: Object.values(patients).length,
      appointmentTypes: Object.values(appointmentTypes).length,
      appointments: Object.values(appointments).length,
      attendanceRecords: attendanceRecords.length
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
  const requiredRoles = [...new Set(DEMO_USERS.map((user) => user.role))];
  const missingRoles = requiredRoles.filter((role) => !roleIds.has(role));
  if (missingRoles.length) throw new Error(`Missing seeded roles: ${missingRoles.join(", ")}`);
  return roleIds;
}

async function upsertClinics(client: PoolClient, tenantId: string) {
  const clinics: Record<DemoClinicKey, DemoClinic> = {} as Record<DemoClinicKey, DemoClinic>;

  for (const clinic of DEMO_CLINICS) {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM clinics
       WHERE tenant_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL
       LIMIT 1`,
      [tenantId, clinic.name]
    );
    const id = existing.rows[0]?.id ?? (
      await client.query<{ id: string }>(
        `INSERT INTO clinics (tenant_id, name, specialization, capacity)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [tenantId, clinic.name, clinic.specialization, clinic.capacity]
      )
    ).rows[0]!.id;

    await client.query(
      `UPDATE clinics
       SET specialization = $3,
           capacity = $4,
           status = 'active',
           deleted_at = NULL
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id, clinic.specialization, clinic.capacity]
    );

    clinics[clinic.key] = { id, key: clinic.key, name: clinic.name };
  }

  return clinics;
}

async function upsertRooms(
  client: PoolClient,
  tenantId: string,
  clinics: Record<DemoClinicKey, DemoClinic>
) {
  const rooms: Record<DemoRoomKey, DemoRoom> = {} as Record<DemoRoomKey, DemoRoom>;

  for (const clinic of DEMO_CLINICS) {
    for (const room of clinic.rooms) {
      const clinicId = clinics[clinic.key].id;
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM rooms
         WHERE tenant_id = $1 AND clinic_id = $2 AND lower(name) = lower($3) AND deleted_at IS NULL
         LIMIT 1`,
        [tenantId, clinicId, room.name]
      );
      const id = existing.rows[0]?.id ?? (
        await client.query<{ id: string }>(
          `INSERT INTO rooms (tenant_id, clinic_id, name, capacity)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [tenantId, clinicId, room.name, room.capacity]
        )
      ).rows[0]!.id;

      await client.query(
        `UPDATE rooms
         SET capacity = $4,
             status = 'active',
             deleted_at = NULL
         WHERE tenant_id = $1 AND id = $2 AND clinic_id = $3`,
        [tenantId, id, clinicId, room.capacity]
      );

      rooms[room.key] = { id, key: room.key, clinicKey: clinic.key };
    }
  }

  return rooms;
}

async function upsertUsers(
  client: PoolClient,
  tenantId: string,
  roleIds: Map<string, string>,
  clinics: Record<DemoClinicKey, DemoClinic>,
  passwordHash: string
) {
  const users: Record<DemoUserKey, DemoUser> = {} as Record<DemoUserKey, DemoUser>;

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

    const clinicKeys = (demoUser.clinicKeys as readonly string[]).includes("all")
      ? DEMO_CLINICS.map((clinic) => clinic.key)
      : demoUser.clinicKeys.filter((clinicKey): clinicKey is DemoClinicKey => clinicKey !== "all");

    for (const clinicKey of clinicKeys) {
      const clinicId = clinics[clinicKey].id;
      await client.query(
        `INSERT INTO user_clinic_access (tenant_id, user_id, clinic_id, access_level)
         VALUES ($1, $2, $3, 'standard')
         ON CONFLICT (tenant_id, user_id, clinic_id) DO NOTHING`,
        [tenantId, user.id, clinicId]
      );
    }

    if (demoUser.role !== "paciente_familia") {
      const collaborator = await upsertCollaborator(client, tenantId, user.id, {
        fullName: demoUser.fullName,
        email: demoUser.email,
        specialty: "specialty" in demoUser && demoUser.specialty ? demoUser.specialty : demoUser.role,
        position: demoUser.role
      });
      for (const clinicKey of clinicKeys) {
        await client.query(
          `INSERT INTO collaborator_clinics (tenant_id, collaborator_id, clinic_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (tenant_id, collaborator_id, clinic_id) DO NOTHING`,
          [tenantId, collaborator.id, clinics[clinicKey].id]
        );
      }
      users[demoUser.key] = { ...user, key: demoUser.key, role: demoUser.role, collaboratorId: collaborator.id };
    } else {
      users[demoUser.key] = { ...user, key: demoUser.key, role: demoUser.role };
    }
  }

  return users;
}

async function upsertUser(
  client: PoolClient,
  tenantId: string,
  input: { fullName: string; email: string; passwordHash: string }
) {
  const email = input.email.toLowerCase();
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM users
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

async function upsertPatients(client: PoolClient, tenantId: string) {
  const patients: Record<DemoPatientKey, DemoPatient> = {} as Record<DemoPatientKey, DemoPatient>;
  for (const patient of DEMO_PATIENTS) {
    patients[patient.key] = await upsertPatient(client, tenantId, patient);
  }
  return patients;
}

async function upsertPatient(
  client: PoolClient,
  tenantId: string,
  input: (typeof DEMO_PATIENTS)[number]
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
    return { id: existing.rows[0].id, key: input.key, fullName: input.fullName };
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
  return { id: inserted.rows[0]!.id, key: input.key, fullName: input.fullName };
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

async function upsertAppointmentTypes(client: PoolClient, tenantId: string) {
  const appointmentTypes: Record<DemoAppointmentTypeKey, { id: string }> = {} as Record<DemoAppointmentTypeKey, { id: string }>;
  for (const type of DEMO_APPOINTMENT_TYPES) {
    appointmentTypes[type.key] = await upsertAppointmentType(client, tenantId, type.name, type.duration);
  }
  return appointmentTypes;
}

function getDemoAppointmentConfigs(): readonly DemoAppointmentConfig[] {
  return [...DEMO_APPOINTMENTS, ...buildWeeklyAppointmentConfigs()];
}

function buildWeeklyAppointmentConfigs(): DemoAppointmentConfig[] {
  const today = new Date();
  const reference = new Date(Date.UTC(DEMO_YEAR, today.getMonth(), today.getDate()));
  const currentWeekStart = startOfWeekMonday(reference);
  const todayKey = dateKey(reference);
  const appointments: DemoAppointmentConfig[] = [];

  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const day = addDays(currentWeekStart, dayOffset);
    const dayId = dateKey(day);
    const monthDay = formatMonthDay(day);

    WEEKLY_APPOINTMENT_TEMPLATES.forEach((template, templateIndex) => {
      const sequence = dayOffset * WEEKLY_APPOINTMENT_TEMPLATES.length + templateIndex;
      const status = resolveWeeklyStatus(sequence);
      const isTodayOrPast = dayId <= todayKey;
      const attendance = resolveWeeklyAttendance(status, isTodayOrPast, templateIndex, sequence);

      appointments.push({
        ...template,
        key: `semana-${dayId}-${template.suffix}`,
        date: monthDay,
        status,
        checkIn: status !== "cancelled" && isTodayOrPast && templateIndex !== 2,
        attendance,
        medicalNote: attendance === "present" && sequence % 4 === 0,
        handoff: status !== "cancelled" && sequence % 5 === 0
      });
    });
  }

  return appointments;
}

function resolveWeeklyStatus(sequence: number): DemoAppointmentConfig["status"] {
  if (sequence % 11 === 0) return "cancelled";
  if (sequence % 7 === 0) return "rescheduled";
  return "scheduled";
}

function resolveWeeklyAttendance(
  status: DemoAppointmentConfig["status"],
  isTodayOrPast: boolean,
  templateIndex: number,
  sequence: number
): DemoAppointmentConfig["attendance"] | undefined {
  if (!isTodayOrPast || status === "cancelled") return undefined;
  if (status === "rescheduled") return "rescheduled";
  if (templateIndex === 0) return "present";
  if (templateIndex === 1 && sequence % 3 === 0) return "absent";
  return undefined;
}

async function upsertAppointmentType(client: PoolClient, tenantId: string, name: string, duration: number) {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM appointment_types
     WHERE tenant_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, name]
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE appointment_types
       SET default_duration_minutes = $3,
           default_pre_session_minutes = 5,
           default_post_session_minutes = 5,
           deleted_at = NULL
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, existing.rows[0].id, duration]
    );
    return existing.rows[0];
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO appointment_types (
       tenant_id, name, default_duration_minutes, default_pre_session_minutes, default_post_session_minutes
     ) VALUES ($1, $2, $3, 5, 5)
     RETURNING id`,
    [tenantId, name, duration]
  );
  return inserted.rows[0]!;
}

async function upsertAppointments(
  client: PoolClient,
  tenantId: string,
  input: {
    actorUserId: string;
    clinics: Record<DemoClinicKey, DemoClinic>;
    rooms: Record<DemoRoomKey, DemoRoom>;
    appointmentTypes: Record<DemoAppointmentTypeKey, { id: string }>;
    patients: Record<DemoPatientKey, DemoPatient>;
    users: Record<DemoUserKey, DemoUser>;
    appointmentConfigs: readonly DemoAppointmentConfig[];
  }
) {
  const appointments: Record<string, DemoAppointment> = {};

  for (const appointment of input.appointmentConfigs) {
    appointments[appointment.key] = await upsertAppointment(client, tenantId, {
      key: appointment.key,
      patientId: input.patients[appointment.patientKey].id,
      patientName: input.patients[appointment.patientKey].fullName,
      collaboratorId: requireCollaborator(input.users[appointment.userKey]),
      clinicId: input.clinics[appointment.clinicKey].id,
      roomId: input.rooms[appointment.roomKey].id,
      appointmentTypeId: input.appointmentTypes[appointment.typeKey].id,
      startsAt: timeOnDate(DEMO_YEAR, appointment.date, appointment.time),
      endsAt: addMinutes(timeOnDate(DEMO_YEAR, appointment.date, appointment.time), appointment.duration),
      status: appointment.status,
      actorUserId: input.actorUserId
    });
  }

  return appointments;
}

async function upsertAppointment(
  client: PoolClient,
  tenantId: string,
  input: {
    key: string;
    patientId: string;
    patientName: string;
    collaboratorId: string;
    clinicId: string;
    roomId: string;
    appointmentTypeId: string;
    startsAt: string;
    endsAt: string;
    status: "scheduled" | "rescheduled" | "cancelled";
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
    return {
      id: existing.rows[0].id,
      key: input.key,
      patientId: input.patientId,
      patientName: input.patientName,
      collaboratorId: input.collaboratorId,
      clinicId: input.clinicId,
      startsAt: input.startsAt
    };
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
  return {
    id: inserted.rows[0]!.id,
    key: input.key,
    patientId: input.patientId,
    patientName: input.patientName,
    collaboratorId: input.collaboratorId,
    clinicId: input.clinicId,
    startsAt: input.startsAt
  };
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
  createdByUserId: string,
  label: string
) {
  await client.query(
    `INSERT INTO medical_notes (
       tenant_id, attendance_record_id, appointment_id, patient_id, collaborator_id,
       content, format_version, created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'demo-medical-note.v2', $7)
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
        summary: `Nota medica smoke para ${label}.`,
        instructions: "Validar vista tipo chat, edicion y lectura por rol.",
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
    appointment: DemoAppointment;
    title: string;
    createdByUserId: string;
    recipientUserIds: string[];
  }
) {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM handoff_notes
     WHERE tenant_id = $1
       AND appointment_id = $2
       AND title = $3
       AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, input.appointment.id, input.title]
  );

  const noteId = existing.rows[0]?.id ?? (
    await client.query<{ id: string }>(
      `INSERT INTO handoff_notes (
         tenant_id, patient_id, appointment_id, created_by_user_id, title, content, priority, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'medium', 'pending')
       RETURNING id`,
      [
        tenantId,
        input.appointment.patientId,
        input.appointment.id,
        input.createdByUserId,
        input.title,
        `Nota de enlace smoke para ${input.title}.`
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
      input.appointment.patientId,
      input.createdByUserId,
      `Nota de enlace smoke para ${input.title}. Validar destinatarios, notificaciones y conversacion.`
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
      title: `Smoke: ${input.title}`,
      message: "Tienes una nota de enlace smoke pendiente de lectura.",
      metadata: {
        target: {
          type: "handoff_note",
          entityId: noteId,
          handoffNoteId: noteId,
          patientId: input.appointment.patientId
        },
        patient: {
          id: input.appointment.patientId,
          fullName: input.appointment.patientName
        },
        handoffNote: { id: noteId },
        appointment: {
          id: input.appointment.id,
          startsAt: input.appointment.startsAt
        }
      }
    });
  }

  return { id: noteId };
}

async function upsertNotification(
  client: PoolClient,
  tenantId: string,
  userId: string,
  input: { type: string; title: string; message: string; metadata?: Record<string, unknown> }
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
           metadata = $6,
           read_at = NULL
       WHERE tenant_id = $1 AND id = $2 AND user_id = $3 AND type = $4`,
      [tenantId, existing.rows[0].id, userId, input.type, input.message, input.metadata ?? {}]
    );
    return;
  }

  await client.query(
    `INSERT INTO notifications (tenant_id, user_id, type, title, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenantId, userId, input.type, input.title, input.message, input.metadata ?? {}]
  );
}

function buildAppointmentNotificationMetadata(
  appointment: DemoAppointment,
  requestedAction: "pending_note" | "reschedule"
) {
  return {
    target: {
      type: "appointment",
      entityId: appointment.id,
      patientId: appointment.patientId
    },
    patient: {
      id: appointment.patientId,
      fullName: appointment.patientName
    },
    appointment: {
      id: appointment.id,
      startsAt: appointment.startsAt,
      clinicId: appointment.clinicId
    },
    requestedAction
  };
}

async function setCurrentUser(client: PoolClient, userId: string) {
  await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
}

function requireCollaborator(user: DemoUser) {
  if (!user.collaboratorId) throw new Error(`Demo user ${user.email} does not have a collaborator`);
  return user.collaboratorId;
}

function timeOnDate(year: number, monthDay: string, time: string) {
  const [month, day] = monthDay.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0)).toISOString();
}

function addMinutes(isoDate: string, minutes: number) {
  return new Date(new Date(isoDate).getTime() + minutes * 60_000).toISOString();
}

function startOfWeekMonday(date: Date) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = value.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + diff);
  return value;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function dateKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function formatMonthDay(date: Date) {
  return [
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
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
