# Runbook: Observability Triage

## First checks

1. Is `/health` live or equivalent process liveness green?
2. Is `/ready` or dependency readiness green?
3. Are metrics/logs/traces present for the expected `environment`?
4. Are recent deploy/version labels visible?
5. Is missing data caused by no traffic, broken exporter, wrong label, or ingestion delay?

## Privacy guard

Do not paste raw logs if they may contain secrets, prompts, files, emails, phone numbers, webhook URLs, cookies, session strings, or raw customer ids. Redact first.

## Escalation

- SEV1: core journey unavailable, data loss, security/privacy incident.
- SEV2: major journey degraded for meaningful user segment.
- SEV3: partial degradation, elevated errors, workaround exists.
- SEV4: low-impact anomaly/investigation.
