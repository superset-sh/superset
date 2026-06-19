# Observability Field Registry

Blueprint source: company-wide `observability-blueprint.md`. This repo adapts the contract; it does not fork the blueprint.

| Field | Type | Headers | Logs | Spans | Metric labels | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `request_id` | generated id | yes | yes | yes | no | One HTTP/IPC/job operation. |
| `trace_id` | W3C trace id | `traceparent` | yes | native | no | Full journey trace. |
| `span_id` | W3C span id | `traceparent` | yes | native | no | Current operation span. |
| `correlation_id` | generated id | yes | yes | yes | no | One business action/retry chain. |
| `actor_id` | hashed/pseudonymous id | yes | yes | yes | no | Never raw email/phone/customer id. |
| `session_id` | session id | optional | yes | yes | no | Browser/app session. |
| `app_version` | bounded string | yes | yes | yes | yes | Release/git SHA/build id. |
| `environment` | enum | optional | yes | yes | yes | `development`, `staging`, `production`. |
| `surface` | enum | yes | yes | yes | yes | `web`, `api`, `worker`, `job`, `desktop`, `mobile`, `gateway`. |
| `route` | template | no | yes | yes | yes | No raw URLs or query strings. |
| `operation` | bounded string | optional | yes | yes | yes | Business operation name. |
| `result` | enum | optional | yes | yes | yes | `success`, `failure`, `cancelled`, `timeout`, `fallback`. |
| `success` | string enum | optional | yes | yes | yes | Use `"true"`/`"false"` for labels. |
| `error_class` | bounded enum | optional | yes | yes | yes | Never raw error message as a label. |

Rules:
- IDs are fine in logs/traces, not metric labels.
- Raw stable identifiers stay local unless explicitly approved.
- Telemetry helpers must redact tokens, cookies, emails, phones, prompts, raw files, webhook URLs, and URL query secrets.
