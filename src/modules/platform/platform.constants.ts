export const CANONICAL_TENANT_ROLES = [
  { name: "admin", description: "Administracion completa del tenant" },
  { name: "direccion", description: "Direccion y supervision operativa" },
  { name: "recepcion", description: "Recepcion y seguimiento operativo sin contenido clinico" },
  { name: "coordinador", description: "Coordinacion de clinicas y agenda" },
  { name: "medico", description: "Atencion medica y notas clinicas" },
  { name: "terapeuta", description: "Atencion terapeutica y notas clinicas" },
  { name: "personal_acompanamiento", description: "Creacion y seguimiento de notas de enlace" },
  { name: "paciente_familia", description: "Rol reservado para un portal futuro; inactivo en el MVP" }
] as const;
