# CRIT API roadmap

## MVP demo

- [x] Generate deterministic, explainable appointment recommendations.
- [x] Revalidate manual and recommended slots with ordered advisory locks.
- Add scheduling configuration CRUD and integrated database contract tests.
- Add the private local-AI worker, summaries and evidence-backed questions.
- Replace the in-process login limiter with a shared store before horizontal scaling.
- Complete request and response schemas in the OpenAPI contract from module Zod schemas.
- Add browser-driven role and privacy tests against the Render gateway.
- Exercise the institutional outbox against its final sandbox contract.

## Production readiness

- Evaluate ranking weights with fictitious demo scenarios before real-world tuning.
- Keep exact pgvector search until measured recall justifies HNSW.
- Complete formal clinical and privacy evaluation before enabling AI in production.
- Move secrets to AWS Secrets Manager or Parameter Store.
- Add centralized logs, metrics, alerts, token revocation and incident runbooks.
- Perform an external security review before using real patient data.

Mobile applications, payments, offline mode and patient/family login remain outside the MVP.
