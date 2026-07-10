# Role permissions

This matrix documents the MVP role boundaries used by CRIT Assist. Tenant
isolation always applies, and clinic-scoped roles are further limited by
`user_clinic_access` or by the collaborator linked to the authenticated user.

## Main API

| Capability | admin | direccion | recepcion | recepcion_general | coordinador | medico | terapeuta | personal_acompanamiento |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Read operational appointments | All tenant | All tenant | Assigned clinics | No main-app access | Assigned clinics | Own appointments | Own appointments | No |
| Create/update appointments | Yes | Yes | Yes | No | Yes | No | No | No |
| Read attendance summaries | All tenant | All tenant | Assigned clinics | No main-app access | Assigned clinics | Own records | Own records | No |
| Register clinical attendance | No | No | No | No | No | Own appointments | Own appointments | No |
| Edit attendance | Yes | Yes | No | No | No | Own records | Own records | No |
| Read medical notes | No clinical content by default | No clinical content by default | Never | Never | No | Own clinical scope | Own clinical scope | Never |
| Create/edit medical notes | No | No | No | No | No | Own attendance | Own attendance | No |
| Read handoff notes | All tenant | All tenant | Created/received | No main-app access | Created/received | Created/received | Created/received | Created/received |
| Create handoff notes | Yes | Yes | Yes | No | Yes | Yes | Yes | Yes |
| Mark handoff note as read | Recipient only | Recipient only | Recipient only | No main-app access | Recipient only | Recipient only | Recipient only | Recipient only |
| Read non-clinical catalogs | Yes | Yes | Yes | No main-app access | Yes | Yes | Yes | Limited by UI |

## Admin API

| Capability | admin | direccion | Other roles |
| --- | --- | --- | --- |
| Manage users, roles and clinic access | Yes | Yes | No |
| Manage clinics, collaborators, patients, rooms and appointment types | Yes | Yes | No |
| Read medical-note content | No | No | No |

## Check-in API

| Capability | admin | direccion | recepcion | recepcion_general | coordinador | medico | terapeuta | Other roles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| List check-in appointments | All tenant | All tenant | Assigned clinics | All tenant | No | Assigned clinics/own scope | Assigned clinics/own scope | No |
| Register check-in | All tenant | All tenant | Assigned clinics | All tenant | No | Assigned clinics/own scope | Assigned clinics/own scope | No |
| Read medical notes | No | No | No | No | No | No | No | No |

Check-in is stored in `appointment_check_ins` and is independent from clinical
attendance stored in `attendance_records`.

## Super-admin API

The platform super admin is not a tenant user and does not receive tenant roles.
It can create and update CRIT tenants, create the first tenant admin, and read
non-clinical operational counts. It must not read medical-note content.
