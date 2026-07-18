# Security and operations

## Browser sessions

Operational and platform sessions use separate HttpOnly cookies. Render and production require `Secure` cookies with `SameSite=Lax`. The frontend never receives or stores a JWT. Bearer authentication exists only for technical integrations and should be disabled with `BEARER_AUTH_ENABLED=false` in browser deployments.

Mutable cookie-authenticated requests must send an `Origin` allowed by `CORS_ORIGIN`. Login endpoints are rate limited. A shared limiter is required before running multiple API replicas.

## Sensitive data

Do not log bodies, cookies, authorization headers, patient names or clinical content. Request logs contain method, path, status, duration and `requestId`. Public errors contain a safe code, message and request reference; SQL details and stacks remain server-side.

Reception roles must never receive medical-note content. Route authorization and PostgreSQL RLS are both required. The platform database role must not read tenant clinical tables.

## Health and support

- `/health/live` confirms that the process is running.
- `/health/ready` verifies PostgreSQL connectivity.
- `x-request-id` is returned on every API response for support correlation.

Rotate JWT and database credentials through the environment secret store. Rotation invalidates active sessions and must be announced for the controlled demo.
