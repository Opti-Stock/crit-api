import { z } from "zod";

const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID"
);

const optionalEmail = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.email().max(255))
  .optional();

const status = z.enum(["active", "inactive"]).optional();
const positiveInt = z.coerce.number().int().positive();
const nonNegativeInt = z.coerce.number().int().min(0);
const sortDir = z.enum(["asc", "desc"]).default("asc");
const paginatedListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(255).optional()
});

export const idParamsSchema = z.object({ id: postgresUuid });
export const listAdminCatalogsSchema = z.object({
  includeDeleted: z.coerce.boolean().default(false)
});
export const listClinicsSchema = paginatedListSchema.extend({
  status,
  includeDeleted: z.coerce.boolean().default(false),
  sortBy: z.enum(["name", "specialization", "capacity", "status"]).default("name"),
  sortDir
});
export const listRoomsSchema = paginatedListSchema.extend({
  clinicId: postgresUuid.optional(),
  status,
  includeDeleted: z.coerce.boolean().default(false),
  sortBy: z.enum(["clinicName", "name", "capacity", "status"]).default("clinicName"),
  sortDir
});
export const listAppointmentTypesSchema = paginatedListSchema.extend({
  sortBy: z.enum([
    "name",
    "defaultDurationMinutes",
    "defaultPreSessionMinutes",
    "defaultPostSessionMinutes"
  ]).default("name"),
  sortDir
});
export const listAuditLogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  entityType: z.string().trim().max(100).optional(),
  entityId: postgresUuid.optional()
});
export const adminReasonSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional()
}).strict();

export const createClinicSchema = z.object({
  name: z.string().trim().min(1).max(255),
  specialization: z.string().trim().max(150).optional(),
  capacity: positiveInt.optional(),
  coordinatorId: postgresUuid.optional()
}).strict();
export const updateClinicSchema = createClinicSchema.partial().extend({ status }).strict();

export const createPatientSchema = z.object({
  fullName: z.string().trim().min(1).max(255),
  birthDate: z.iso.date(),
  externalId: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(50).optional(),
  email: optionalEmail,
  disability: z.string().trim().max(100).optional(),
  gender: z.string().trim().max(50).optional()
}).strict();
export const updatePatientSchema = createPatientSchema.partial().extend({ status }).strict();

export const createRoomSchema = z.object({
  clinicId: postgresUuid,
  name: z.string().trim().min(1).max(100),
  capacity: positiveInt.optional()
}).strict();
export const updateRoomSchema = createRoomSchema.partial().extend({ status }).strict();

export const createAppointmentTypeSchema = z.object({
  name: z.string().trim().min(1).max(150),
  defaultDurationMinutes: positiveInt,
  defaultPreSessionMinutes: nonNegativeInt.default(0),
  defaultPostSessionMinutes: nonNegativeInt.default(0)
}).strict();
export const updateAppointmentTypeSchema = createAppointmentTypeSchema.partial().strict();

export const createCollaboratorSchema = z.object({
  userId: postgresUuid,
  fullName: z.string().trim().min(1).max(255),
  specialty: z.string().trim().min(1).max(150),
  externalId: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(50).optional(),
  email: optionalEmail,
  gender: z.string().trim().max(50).optional(),
  position: z.string().trim().max(100).optional(),
  clinicIds: z.array(postgresUuid).default([])
}).strict();
export const updateCollaboratorSchema = createCollaboratorSchema
  .omit({ userId: true })
  .partial()
  .extend({ status, clinicIds: z.array(postgresUuid).optional() })
  .strict();

export type CreateClinicInput = z.output<typeof createClinicSchema>;
export type ListAdminCatalogsInput = z.output<typeof listAdminCatalogsSchema>;
export type ListClinicsInput = z.output<typeof listClinicsSchema>;
export type ListRoomsInput = z.output<typeof listRoomsSchema>;
export type ListAppointmentTypesInput = z.output<typeof listAppointmentTypesSchema>;
export type ListAuditLogsInput = z.output<typeof listAuditLogsSchema>;
export type AdminReasonInput = z.output<typeof adminReasonSchema>;
export type UpdateClinicInput = z.output<typeof updateClinicSchema>;
export type CreatePatientInput = z.output<typeof createPatientSchema>;
export type UpdatePatientInput = z.output<typeof updatePatientSchema>;
export type CreateRoomInput = z.output<typeof createRoomSchema>;
export type UpdateRoomInput = z.output<typeof updateRoomSchema>;
export type CreateAppointmentTypeInput = z.output<typeof createAppointmentTypeSchema>;
export type UpdateAppointmentTypeInput = z.output<typeof updateAppointmentTypeSchema>;
export type CreateCollaboratorInput = z.output<typeof createCollaboratorSchema>;
export type UpdateCollaboratorInput = z.output<typeof updateCollaboratorSchema>;
