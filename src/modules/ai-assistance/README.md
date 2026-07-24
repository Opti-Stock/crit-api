# AI assistance

This module exposes persistent summaries and evidence-backed questions for
medical and handoff histories.

## Contracts

- `POST /api/patients/:patientId/note-summaries`
- `GET /api/patients/:patientId/note-summaries/latest?kind=medical|handoff`
- `GET /api/note-summaries/:summaryId`
- `POST /api/patients/:patientId/ai-questions`
- `GET /api/ai-interactions/:interactionId`
- `GET /api/patients/:patientId/ai-interactions?kind=medical|handoff`
- `POST /api/ai-interactions/:interactionId/feedback`

POST operations return `503 AI_DISABLED` when the worker feature is disabled.
Medical requests reject reception and accompaniment-only roles. Interaction
history is visible only to its requester and expires after the configured
retention period.

The API never runs inference in an HTTP request. It records an authorized job
and returns `202`; the private worker reuses the requester's tenant/user context.
