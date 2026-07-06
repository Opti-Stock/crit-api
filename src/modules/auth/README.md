# Auth module

Provides authentication for the main API through `POST /api/auth/login`.

The module follows `routes -> controller -> service -> repository -> PostgreSQL`.
Email addresses are normalized before lookup. The tenant is resolved internally
from a unique active user email in an active tenant; ambiguous emails are rejected
with the same generic authentication error.

Successful authentication returns an HS256 access token containing the user ID,
tenant ID, and role names. Invalid user, status, password, and ambiguous email
combinations all produce the same response so the endpoint does not reveal
account existence or tenant membership.

`GET /api/auth/me` validates a Bearer token and returns its authenticated context.
Protected routes derive the tenant exclusively from that context. Shared middleware
also provides role checks for operational and administrative modules.
