# Observability Query Reference

Status: initial repo contract. Fill datasource names when Grafana/OTel/PostHog/Sentry wiring lands.

## Canonical labels

- `environment`: `development`, `staging`, `production`
- `surface`: `web`, `api`, `worker`, `job`, `desktop`, `mobile`, `gateway`
- `success`: `"true"` or `"false"`
- `route`: route templates only
- `operation`: bounded business operation names

## Baseline metrics expected

- `api_requests_total` or repo equivalent
- `http_server_request_duration_seconds`
- `job_runs_total`
- `job_duration_seconds`
- `external_dependency_requests_total`
- `external_dependency_duration_seconds`
- `telemetry_events_accepted_total`
- `telemetry_events_rejected_total`
- `telemetry_events_dropped_total`
- `telemetry_export_failures_total`

## Missing-data taxonomy

Empty dashboard can mean: no traffic, no failures, broken exporter, wrong query function, wrong environment label, not deployed yet, ingestion delay, datasource/query error.

## False query traps

- Do not query raw URLs; use route templates.
- Do not group metrics by generated IDs or user hashes.
- Do not use `rate()` on serverless event gauges; use the documented function for that metric type.
