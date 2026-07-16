# Auth module

Provides operational login, logout and session inspection through `/api/auth`.

The module follows `routes -> controller -> service -> repository -> PostgreSQL`. Email is normalized and the tenant is resolved from one unique active account. Missing, inactive, ambiguous and invalid-password accounts return the same error.

The service signs an HS256 JWT containing user ID, tenant ID and roles. The HTTP controller places it in the `crit_session` HttpOnly cookie and returns only profile data and expiration. `GET /api/auth/me` accepts that cookie; technical Bearer authentication is optional by environment. `POST /api/auth/logout` clears the browser cookie.

Tenant selectors supplied through body, query or `x-tenant-id` are rejected. Authorization and PostgreSQL RLS remain mandatory for every protected operation.
