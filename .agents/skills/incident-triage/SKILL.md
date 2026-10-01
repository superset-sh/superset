---
name: incident-triage
description: First-pass triage of a possible production incident for Superset's hosted services. Gathers signals (recent deploys, Sentry spikes, health checks), proposes a severity and a status.superset.sh message, then stops for human approval. Use when someone reports an outage, errors spike, or asks "is something down?".
---

# Incident triage

You gather facts and draft. A human decides and posts. The runbook is
`docs/runbooks/incidents.md`; read its "Severity" and "Status page updates" sections before you
start.

## Rules

- Read-only. Do not deploy, roll back, disable workflows, change flags, resolve Sentry issues,
  or run SQL that writes.
- Do not post to status.superset.sh, Slack, Discord, Plain, X, or any other channel. Do not declare
  an incident. Your output is a draft in this conversation.
- If a tool is not connected or a check fails, write "not checked" and the reason. Do not guess.
- Use UTC times everywhere.

## 1. Frame the report

Write one line each:

- What users see, in their words.
- When it started (first report, or first signal you find).
- Who is affected: everyone, one region, one feature, one version, or one user.

If only one user or one machine is affected, stop here. Tell the human that this is a support
issue, and suggest `superset doctor`.

## 2. Gather signals

Run the checks that can run in parallel at the same time. Record each result with its time.

1. **Recent deploys**
   ```bash
   gh run list --workflow "Deploy Production" --limit 5 \
     --json databaseId,headSha,status,conclusion,createdAt,updatedAt
   git log --since="6 hours ago" --oneline origin/main
   ```
   For a run near the start time, look at the failed or slow jobs, especially `deploy-database`
   (migrations): `gh run view <id> --json jobs`.
2. **Sentry.** Use the Sentry MCP tools when they are connected. Search for issues first seen or
   spiking in the last 2 hours, in these projects: api, web, relay, realtime, desktop. For each
   match, record the issue title, event count, first-seen time, and the release.
3. **Health checks** (GET only, 10-second timeout):
   ```bash
   curl -sS -m 10 -w ' %{http_code} %{time_total}s\n' https://relay.superset.sh/health
   curl -sS -m 10 -w ' %{http_code} %{time_total}s\n' https://realtime.superset.sh/health
   curl -sS -m 10 -w ' %{http_code} %{time_total}s\n' https://api.superset.sh/api/health
   ```
   Expected: relay `{"ok":true,"proto":2}` 200, realtime `{"ok":true}` 200, API
   `{"ok":true,"database":"ok"}` 200. A 503 from the API names the database state. Before
   `/api/health` is deployed it returns 404; then use `https://api.superset.sh/api`, where 401 means up.
   Any other 5xx or a timeout is a failure.
   Also read `https://status.superset.sh/api/v2/summary.json` to see what the page shows now.
4. **Vercel** (if the CLI is linked): `vercel ls` for recent production deploys, and
   `vercel logs <deployment-url>` for errors around the start time.
5. **Upstream status.** Name the upstream provider that the signals point to (Vercel, Cloudflare,
   Neon, GitHub), and ask the human to check its status page. Do not fetch those pages yourself unless the human asks.

## 3. Propose

Reply with this block and nothing after it:

```
## Triage draft (not posted)

Summary: <one line: what is broken, since when, for whom>

Signals
- Deploys: <result>
- Sentry: <result>
- Health: relay <code>, realtime <code>, api <code>
- Vercel: <result or "not checked: reason">
- Likely cause: <one line, or "unknown">

Proposed severity: SEV<1|2|3> — <one-line reason from the runbook table>

Proposed status.superset.sh update (<Investigating|Identified|Monitoring|Resolved>):
> <message from the runbook template, filled in>

Suggested next steps for the lead:
1. <for example "roll back deployment X with vercel rollback">
2. ...

Waiting for approval. I have not posted, deployed, or changed anything.
```

## 4. Stop

Wait for the human. If they approve the message, they post it in incident.io themselves. If they
ask for a change, redraft and stop again. This skill stays read-only after approval. A rollback
or any other write action is a separate request outside this skill.
