# PostgreSQL and CRIT API integration

## Database contract

`crit-db` owns schema, migrations, seeds and RLS policies. `crit-api` connects
through the non-owner `crit_app` role and never executes DDL at startup.

```dotenv
DATABASE_URL=postgresql://crit_app:crit_app@127.0.0.1:5432/crit_db
```

`npm run db:check` executes a connectivity query and verifies that
`public.tenants` exists without printing credentials.

Every tenant-scoped repository operation uses one `PoolClient` and transaction:

1. `BEGIN`.
2. `set_config('app.current_tenant_id', tenantId, true)`.
3. `set_config('app.current_user_id', userId, true)`; workers use an empty user.
4. Parameterized SQL with an explicit `tenant_id` filter.
5. `COMMIT` or `ROLLBACK`, followed by release of the same client.

Never use persistent `SET` values on a pooled connection. RLS is defense in
depth, not a replacement for explicit tenant filters.

## Attendance outbox producer

`POST /api/attendance` inserts the attendance and its `crit_api_outbox` event in
the same transaction. If either insert fails, both roll back. No network request
occurs during the clinical transaction.

The only M3 producer is `attendance.registered`. Appointments, medical notes and
other modules do not enqueue external events.

The provisional payload is versioned:

```json
{
  "schemaVersion": 1,
  "eventId": "uuid",
  "eventType": "attendance.registered",
  "occurredAt": "2026-06-22T12:00:00.000Z",
  "tenantCode": "CRIT-OCC-01",
  "data": {
    "attendanceId": "uuid",
    "appointmentId": "uuid",
    "patientExternalId": "external-id-or-null",
    "collaboratorExternalId": "external-id-or-null",
    "status": "present",
    "checkedAt": "2026-06-22T12:00:00.000Z"
  }
}
```

It deliberately excludes names, contact details, `notesRequired`, passwords,
medical notes and all clinical content. The institutional contract may replace
this envelope later through a new `schemaVersion`.

## Worker lifecycle

The worker runs independently from the three HTTP apps:

```powershell
npm run worker:crit-post-api
npm run worker:crit-post-api:once
```

For each active tenant it:

1. Recovers stale `processing` rows as `failed`.
2. Claims `pending` or `failed` rows below the retry limit with
   `FOR UPDATE SKIP LOCKED`.
3. Marks them `processing` and increments `retry_count` in a short transaction.
4. Commits before performing HTTP.
5. Sends the payload with Bearer authentication and `Idempotency-Key: eventId`.
6. Marks each event `sent` with `sent_at`, or `failed` with a sanitized
   `last_error`.

The idempotency key is required because a worker can crash after the external
API accepts a request but before PostgreSQL records `sent`. The receiving API
should deduplicate by this key.

Failures never store response bodies, tokens, URLs, payloads or exception
messages. HTTP failures retain only the status code; transport failures use a
generic message. Events at `CRIT_POST_API_MAX_RETRIES` remain `failed` and are
not claimed automatically.

## Configuration

```dotenv
CRIT_POST_API_URL=
CRIT_POST_API_TOKEN=
CRIT_POST_API_POLL_INTERVAL_MS=5000
CRIT_POST_API_BATCH_SIZE=10
CRIT_POST_API_MAX_RETRIES=5
CRIT_POST_API_REQUEST_TIMEOUT_MS=10000
CRIT_POST_API_PROCESSING_TIMEOUT_MS=60000
```

URL and token are optional for the HTTP apps but mandatory for the worker. The
continuous worker handles `SIGINT` and `SIGTERM`; one-shot mode processes one
batch per active tenant and exits.

## Validation

`npm run test:outbox-integration` uses the local `crit_app` connection and a
temporary HTTP server. It verifies transaction rollback, successful delivery,
sanitized failure, retry exhaustion, stale recovery and two-worker claiming.
It requires the tenant and administrator configured through `admin:bootstrap`.
Operational fixtures are fictitious and removed after the run. Immutable audit
entries remain by design and contain entity identifiers and changed field names,
not fixture values or clinical content.

The complete database handoff remains in
`../crit-db/docs/crit-api-handoff.md`.
