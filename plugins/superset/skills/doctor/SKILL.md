---
name: doctor
description: Diagnose and fix Superset problems — connection failures, offline hosts, terminals not attaching, auth or update issues. Use when the user reports something broken or misbehaving in Superset itself, before filing feedback.
argument-hint: describe the symptom
---

# Superset Doctor

Diagnose first, change one thing at a time, verify after each change.

## 1. Snapshot (read-only, run in parallel, tolerate failures)

- `superset status` — host service health
- `superset auth whoami` — auth + active org
- `superset hosts list` — host reachability
- `superset --version`

## 2. Match known signatures

| Signature | Fix |
| --- | --- |
| `whoami` fails / session expired | `superset auth login` |
| Host shows offline | `superset hosts wake <id>`; confirm the machine is awake and online |
| Host service not running | `superset start` |
| CLI and desktop app version mismatch, or stale CLI | `superset update` |
| App-side misbehavior (macOS) | read the newest entries in `~/Library/Logs/Superset/main.log` for errors |

Propose the matching fix and get the user's go-ahead before running anything that changes state. Never delete data as a "fix".

## 3. Verify

Re-run the originally failing action. If it works, say exactly what was wrong and what fixed it.

## 4. Escalate with evidence

If unresolved, offer to file it via the `superset:feedback` skill — carry over the collected diagnostics (versions, status output, the relevant log excerpt) so the report arrives pre-triaged. Ask before including any log content; logs can contain paths and project names.
