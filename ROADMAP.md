# CRIT API roadmap

## MVP demo

- Replace the in-process login limiter with a shared store before horizontal scaling.
- Complete request and response schemas in the OpenAPI contract from module Zod schemas.
- Add browser-driven role and privacy tests against the Render gateway.
- Exercise the institutional outbox against its final sandbox contract.

## Production readiness

- Move secrets to AWS Secrets Manager or Parameter Store.
- Add centralized logs, metrics, alerts, token revocation and incident runbooks.
- Perform an external security review before using real patient data.

Mobile applications, payments, offline mode and patient/family login remain outside the MVP.
