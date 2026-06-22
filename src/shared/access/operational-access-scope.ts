export interface OperationalAccessScope {
  tenantWide: boolean;
  clinics: boolean;
  ownCollaborator: boolean;
}

const TENANT_WIDE_ROLES = new Set(["admin", "direccion"]);
const CLINIC_SCOPED_ROLES = new Set(["recepcion", "coordinador"]);
const OWN_COLLABORATOR_ROLES = new Set(["medico", "terapeuta"]);

export function resolveOperationalAccessScope(roles: readonly string[]): OperationalAccessScope {
  const tenantWide = roles.some((role) => TENANT_WIDE_ROLES.has(role));

  return {
    tenantWide,
    clinics: !tenantWide && roles.some((role) => CLINIC_SCOPED_ROLES.has(role)),
    ownCollaborator: !tenantWide && roles.some((role) => OWN_COLLABORATOR_ROLES.has(role))
  };
}
