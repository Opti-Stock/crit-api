# Auth module

Provides authentication for the main API through `POST /api/auth/login`.

The module follows `routes -> controller -> service -> repository -> PostgreSQL`.
Tenant codes and email addresses are normalized before lookup. The tenant is resolved
first, and every user query runs with PostgreSQL tenant context plus an explicit
`tenant_id` filter.

Successful authentication returns an HS256 access token containing the user ID,
tenant ID, and role names. Invalid tenant, user, status, and password combinations
all produce the same response so the endpoint does not reveal account existence.

Bearer authentication, authorization middleware, and `/api/auth/me` are implemented
separately in OPT-27.
