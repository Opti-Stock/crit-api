# CRIT API roadmap

## MVP demo

- [x] Add protected summary and evidence-backed question contracts.
- [x] Add a single-job local AI worker with exact hybrid retrieval.
- [x] Add an opt-in Docker Compose profile for the private real-model worker.
- Validate the pinned real-model image and fictitious evaluation dataset.
- Measure Recall@12 and source support before enabling AI in the Render demo.
- [x] Generate deterministic, explainable appointment recommendations.
- [x] Revalidate manual and recommended slots with ordered advisory locks.
- [x] Add clinic-scoped scheduling configuration CRUD with role checks.
- Add integrated database contract tests for scheduling configuration.
- Replace the in-process login limiter with a shared store before horizontal scaling.
- Complete request and response schemas in the OpenAPI contract from module Zod schemas.
- Add browser-driven role and privacy tests against the Render gateway.
- Exercise the institutional outbox against its final sandbox contract.

## Production readiness

- Keep AI disabled until retention, privacy and clinical responsibility are approved.
- Evaluate HNSW only after exact-search measurements require it.
- Evaluate ranking weights with fictitious demo scenarios before real-world tuning.
- Keep exact pgvector search until measured recall justifies HNSW.
- Complete formal clinical and privacy evaluation before enabling AI in production.
- Move secrets to AWS Secrets Manager or Parameter Store.
- Add centralized logs, metrics, alerts, token revocation and incident runbooks.
- Perform an external security review before using real patient data.

Mobile applications, payments, offline mode and patient/family login remain outside the MVP.
