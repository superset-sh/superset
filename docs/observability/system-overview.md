# superset Observability System Overview

Blueprint source: company-wide `observability-blueprint.md`. Vendor stack can vary; principle IDs do not.

Repo: `/Users/aytuncyildizli/superset`
Surface: agent/desktop/web app surface

## Minimum contract

- Correlation: `request_id`, `trace_id`, `span_id`, `correlation_id`, privacy-safe `actor_id`.
- Signals: structured logs, metrics, traces/manual business spans, product/client events where applicable.
- Privacy: no raw secrets, prompts, files, emails, phone numbers, webhook URLs, cookies, or raw customer ids in telemetry.
- Operations: health and readiness are separate; dashboards/alerts/runbooks live in source control.

## Implementation status

RED until this repo has real helpers/tests/wiring. This directory is the source-control contract seed.
