# Authentication and roles

## Login

The main API exposes `POST /api/auth/login`:

```json
{
  "email": "user@crit.org",
  "password": "..."
}
```

The email is trimmed and converted to lowercase. The tenant is resolved
internally from a single active user email in an active tenant.

Invalid user, inactive user, inactive tenant, ambiguous email, and password
combinations return the same `INVALID_CREDENTIALS` response. Password hashes are
internal repository data and must never be returned or logged.

Successful login returns an HS256 access token. Its subject is the user ID, and
its private claims contain `tenantId` and the user's active role names. Tokens use
the configured expiration, issuer, and audience:

```dotenv
JWT_SECRET=replace_with_at_least_32_characters
JWT_EXPIRES_IN=8h
JWT_ISSUER=crit-api
JWT_AUDIENCE=crit-assist
```

## Initial roles

- `admin`
- `direccion`
- `recepcion`
- `recepcion_general`
- `coordinador`
- `medico`
- `terapeuta`
- `personal_acompanamiento`
- `paciente_familia` (reserved and not assigned in the MVP)

## Access rules

- `direccion` and `admin` manage users, roles, and configuration, but do not
  receive clinical access automatically.
- `recepcion` can read operational attendance information, but cannot register
  attendance and must never receive medical note content.
- `recepcion_general` is reserved for the main reception desk. It can access the
  check-in scanner for all appointments in the tenant, but does not receive
  calendar, attendance, or clinical note permissions in the main app.
- `medico` and `terapeuta` register attendance and medical notes under clinical
  RLS policies.
- `coordinador` manages calendars and appointments for authorized clinics.
- `personal_acompanamiento` creates handoff notes when authorized.
- Authorization combines tenant, roles, clinic access, and resource ownership
  where applicable.

## Protected routes

Protected routes require `Authorization: Bearer <token>`. Tokens are accepted only
with HS256, the configured issuer and audience, a valid expiration, a UUID subject,
a UUID `tenantId`, and a role-name array.

`GET /api/auth/me` returns the authenticated `userId`, `tenantId`, and roles.
Repositories must use this tenant context; protected endpoints reject `tenantId`,
`tenant_id`, and `x-tenant-id` selectors supplied by clients.

Route authorization uses `requireRoles(...)` with OR semantics. Clinical routes
that expose medical note content must require `medico` or `terapeuta`; reception
must never pass that authorization.

## Administrative API

Only `admin` and `direccion` can access these routes in `admin-api`:

- `GET /admin/roles`
- `GET|POST /admin/users`
- `GET|PATCH /admin/users/:userId`
- `PUT /admin/users/:userId/roles`
- `PUT /admin/users/:userId/clinic-access`
- `PUT /admin/users/:userId/password`

Role and clinic assignments are tenant-scoped and replaced transactionally. The
last active administrator cannot be deactivated or lose the `admin` role.

## Platform super admin

The platform super admin is not a tenant user and does not use tenant roles.
It authenticates through `POST /super-admin/auth/login` with email and password,
receives a platform-scoped JWT, and can create CRIT tenants plus the first
tenant admin through `super-admin-api`.

The platform database role is intentionally separate from `crit_app`. It can
provision tenants, roles, users and assignments, and can read non-clinical
operational counts. It must not receive access to medical-note content.

## Multiple roles

A user may hold several roles at the same time. Route authorization uses OR
semantics, so `medico` plus `coordinador` can use either role's endpoints.
Operational read scopes are combined: own clinical records plus records from
authorized clinics. Tenant-wide roles (`admin`, `direccion`) supersede narrower
read scopes.

Roles are embedded in the access token at login. After an administrator changes
role assignments, the affected user must log in again to receive an updated
token. Removed roles can remain effective until the current token expires.

Clinic access does not grant a role by itself. It only limits or expands the
operational scope of roles such as `recepcion` and `coordinador`. A user with
`medico` plus `coordinador` sees owned clinical appointments and attendance as
well as operational records in assigned clinics, while medical-note content
still requires the clinical role and clinical RLS context.

The MVP does not persist sessions, refresh tokens, revocation lists, or logout
state. Deactivating a user does not invalidate an already issued token. An
emergency global revocation requires rotating `JWT_SECRET` and restarting both
API processes; otherwise existing tokens remain valid until their original
expiration.
