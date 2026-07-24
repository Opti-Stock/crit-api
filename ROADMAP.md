# CRIT API roadmap

## MVP demo

- [x] Add protected summary and evidence-backed question contracts.
- [x] Add a single-job local AI worker with exact hybrid retrieval.
- Validate the pinned real-model image and fictitious evaluation dataset.
- Measure Recall@12 and source support before enabling AI in the Render demo.
- Replace the in-process login limiter with a shared store before horizontal scaling.
- Complete request and response schemas in the OpenAPI contract from module Zod schemas.
- Add browser-driven role and privacy tests against the Render gateway.
- Exercise the institutional outbox against its final sandbox contract.

## Production readiness

- Keep AI disabled until retention, privacy and clinical responsibility are approved.
- Evaluate HNSW only after exact-search measurements require it.
- Move secrets to AWS Secrets Manager or Parameter Store.
- Add centralized logs, metrics, alerts, token revocation and incident runbooks.
- Perform an external security review before using real patient data.

Mobile applications, payments, offline mode and patient/family login remain outside the MVP.
