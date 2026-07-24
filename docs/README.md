# CRIT API documentation

- [API conventions](api-conventions.md)
- [Levantamiento local completo](local-development.md)
- [Authentication and roles](auth-and-roles.md)
- [Role permissions](role-permissions.md)
- [Render deployment](render-deployment.md)
- [Security and operations](security-and-operations.md)
- [Tenant onboarding](tenant-onboarding.md)
- [CRIT institutional integration](crit-api-integration.md)
- [Realtime events](realtime-events.md)
- [IA local, resúmenes y RAG](local-ai.md)
- [ADR 002: IA local y pgvector](adr-002-local-ai-pgvector.md)

When `OPENAPI_ENABLED=true`, authenticated administrators can inspect the live contracts at `/api/docs`, `/admin/docs`, `/checkin/docs` and `/super-admin/docs`. Machine-readable OpenAPI 3.1 documents use the corresponding `/openapi.json` routes.
