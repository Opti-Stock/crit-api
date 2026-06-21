# Authentication and roles

## Login

The main API exposes `POST /api/auth/login`:

```json
{
  "tenantCode": "CRIT-OCC-01",
  "email": "user@crit.org",
  "password": "..."
}
```

The tenant code is trimmed and converted to uppercase. The email is trimmed and
converted to lowercase. The active tenant is resolved before querying `users`,
because email addresses are unique only within a tenant.

Invalid tenant, user, status, and password combinations return the same
`INVALID_CREDENTIALS` response. Password hashes are internal repository data and
must never be returned or logged.

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
- `coordinador`
- `medico`
- `terapeuta`
- `personal_acompanamiento`
- `paciente_familia` (reserved and not assigned in the MVP)

## Access rules

- `direccion` and `admin` manage users, roles, and configuration, but do not
  receive clinical access automatically.
- `recepcion` can register and read operational attendance information, but must
  never receive medical note content.
- `medico` and `terapeuta` register attendance and medical notes under clinical
  RLS policies.
- `coordinador` manages calendars and appointments for authorized clinics.
- `personal_acompanamiento` creates handoff notes when authorized.
- Authorization combines tenant, roles, clinic access, and resource ownership
  where applicable.

Bearer authentication, authorization middleware, and authenticated request
context are introduced by OPT-27.
