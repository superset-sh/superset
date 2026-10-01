# Incidents

How to run an incident for Superset's hosted services, and how to keep status.superset.sh current
while it happens. Agents: `.agents/skills/incident-triage/SKILL.md` does the first pass of the
"Where to look first" section and drafts the status message. A human posts it.

## status.superset.sh

| | |
|---|---|
| Provider | **incident.io** status page "Superset" (standalone page, created 24 March 2026). Confirmed 30 September 2026: the page CSP names `status-page-*-incident-io-team.vercel.app`. Nothing in this repo configures it. |
| DNS | `superset.sh` is on Cloudflare. `status` has its own **DNS-only** CNAME to `cname.vercel-dns-016.com` (added 30 September 2026), so the page does not go through the Cloudflare proxy that relay and realtime also use. Vercel holds its own certificate for the name. To undo, delete the record; the proxied `*.superset.sh` wildcard then serves it again. |
| Components | Desktop App, Web App, General API, Integrations, Marketing Site, Remote Access (relay), Sign-in. |
| Link in the product | `COMPANY.STATUS_URL` in `packages/shared/src/constants.ts`, used by the marketing footer, the contact page and `index.md`. |
| Monitoring | Sentry uptime monitors (org `superset-sh`) check the web app, API, sign-in route, API health with a database check, relay, relay v2, realtime, marketing, docs and usercontent every 1 to 5 minutes. The Sentry alert "Uptime failures to incident.io" sends their failures to the incident.io alert source "Sentry uptime monitors". incident.io does not run checks itself. A person still changes the status page. |
| On-call | incident.io schedule "Primary on-call": Avi Peltz, Satya Patel, Harshith Mullapudi, one week each, handover Wednesday 09:00 Pacific. The escalation path "Primary on-call" pages the person on call at high urgency, and tries again 3 times if no one acknowledges in 5 minutes. The alert route "Uptime failures" sends the "Sentry uptime monitors" source to that path. It also posts each alert in the `#incidents` channel of the Superset Slack, with buttons to acknowledge or to declare an incident. It does not create an incident automatically. |
| History | No incident has ever been posted. Every component shows 100.00% uptime since 24 March 2026, including the API outage on 17 September 2026. |
| How to update | incident.io dashboard: declare or open the incident, then publish a status page update. |

Setup still open in incident.io (org `superset-sh`):

- [x] Components: added Remote Access and Sign-in, renamed Webhooks to Integrations (30 September 2026).
- [x] Edit rights: Avi, Harshith, Kiet and Satya are all Owners with full seats.
- [x] Sentry connected to incident.io, with the alert source "Sentry uptime monitors" and the Sentry alert "Uptime failures to incident.io" (30 September 2026). Component for each monitor:

  | Sentry uptime monitor | Component |
  |---|---|
  | API (`/.well-known/oauth-protected-resource`): the API answers. | General API |
  | API health + database (`/api/health`): the API can read one row from `auth.users` and from `auth.organizations` in 3 seconds. A lock on those tables, as on 17 September 2026, makes it fail. It does not replace the monitor above. incident.io shows the two as separate alerts for the person on call. | General API |
  | Sign-in (`/api/auth/ok`). This shows that the auth routes answer. It does not do a full sign-in, so also set Sign-in by hand when users report that they cannot sign in. | Sign-in |
  | Relay, Relay v2 (`/health`) | Remote Access |
  | Realtime (`/health`) | Desktop App, Web App (live updates) |
  | Web app (`app.superset.sh/sign-in`) | Web App |
  | `superset.sh` | Marketing Site |
  | Docs (`docs.superset.sh`), Usercontent (`supersetusercontent.com/health`) | No component. The alert still pages the person on call. |

- [x] Paging: escalation path "Primary on-call" and alert route "Uptime failures" (1 October 2026).
- [x] Sentry uptime monitor "API health + database" for `https://api.superset.sh/api/health` (503 means the database is failing), connected to the "Uptime failures to incident.io" alert (1 October 2026). Component: General API.
- [x] Test alert (1 October 2026): "Send Test Notification" on the Sentry alert reached incident.io, posted in `#incidents`, and escalated to the person on call. To test again without a surprise page, first add a short schedule override for yourself.
- [x] The "Uptime failures" route posts in `#incidents`.
- [x] Sentry alert "Error spike to incident.io (50+ in 5 min)" (1 October 2026): one issue in the desktop, web or api project seen more than 50 times in 5 minutes goes to the same alert source, so it pages and posts in `#incidents`. At most one alert per issue in 30 minutes. This catches an incident where every endpoint answers but the app is broken, as on 23 September 2026.
- [ ] Publish the past incidents of 17 September 2026 (API outage) and 23 September 2026 (desktop workspace screens) on the status page, with their real times.
- [ ] Each person in the rotation: set a phone number or the incident.io mobile app in your notification preferences. Without one, a page can arrive only as an email or a Slack message.

To check the page again: `curl -sS https://status.superset.sh/proxy/status.superset.sh` returns
the components and ongoing incidents as JSON.

## Severity

| Level | Meaning | Examples | Status page |
|---|---|---|---|
| **SEV1** | Most users cannot use Superset, or data is at risk. | API down; sign-in broken for everyone; relay down, so no remote host connects; a migration locks auth tables. | Required, in 15 minutes or less. |
| **SEV2** | One core feature is broken or much slower for many users, and a workaround exists or the rest works. | Remote access broken in one region; Linear or GitHub integrations stop syncing; web app errors on one page. | Required, in 30 minutes or less. |
| **SEV3** | Small or partial effect. | One integration degraded; slow queries on a background job; a desktop release bug with a known fix. | Optional. Post if users report it. |

When unsure, pick the higher level. It is easy to lower the level later.

Local-only problems (one user's host-service, one machine's terminals) are support issues, not
incidents. Send them through `superset doctor` and support.

## Who declares an incident

Any team member can declare one. Do not wait for permission. The person who declares is the
**incident lead** until they hand it off in the incident channel. The lead:

1. Sets the severity.
2. Owns the status page updates, or names one person to do them.
3. Names who investigates and who talks to users.
4. Declares the incident resolved.

Agents never declare an incident or post an update. They gather signals and draft messages for the lead.

## Where to look first

Look in this order. Stop when you find a cause that explains what users see.

1. **Recent deploys.** A `Deploy Production` run on `main` (`.github/workflows/deploy-production.yml`)
   starts on every push. Run `gh run list --workflow "Deploy Production" --limit 5` and compare the
   times to the start of the problem. The `deploy-database` job runs migrations. A migration that
   holds a lock can take the API down, as on 17 September 2026. See
   `.agents/skills/db-migrations/SKILL.md`.
2. **Sentry.** Look for new issues or a spike in every project: api, web, admin, marketing, docs,
   relay (it also holds realtime), sandbox, desktop, host-service, mobile. A new issue with a
   large event count that started after a deploy is the strongest signal.
3. **Health checks.**
   - Relay: `https://relay.superset.sh/health` returns `{"ok":true,"proto":2}`.
   - Realtime: `https://realtime.superset.sh/health` returns `{"ok":true}`.
   - API: `https://api.superset.sh/api/health` returns `{"ok":true,"database":"ok"}` with 200.
     It reads one row from `auth.users` and from `auth.organizations`. A 503 with
     `"database":"timeout"` means that the read did not finish in 3 seconds (look for lock
     waits). A 503 with `"database":"error"` means that the query failed immediately (look for
     a connection or configuration problem).
4. **Vercel.** api, web, marketing, admin and docs run there. Look at the deployment list,
   the runtime logs (`vercel logs`) and the function error rate. `vercel rollback` is the fastest
   fix for a bad API or web deploy. Use it before you try a fix forward, unless a migration has
   already run.
5. **Cloudflare.** relay, realtime, usercontent and the sandbox gate run as Workers (`wrangler deploy`).
   Look at the Workers logs and errors in the Cloudflare dashboard.
6. **Database (Neon).** Look for lock waits, long queries and connection count. `automation_events`
   has slow reads by design, so it is not a cause without more proof.
7. **Host-service.** Host-service runs on user machines, not on our servers. If many users report
   hosts offline, the cause is usually the relay or the API, not host-service. Look at the relay
   first, then at the Sentry desktop project for a spike on one version.
8. **Upstream providers.** Status pages for Vercel, Cloudflare, Neon, GitHub, and the model providers.

## Status page updates

Update the page when you declare a SEV1 or SEV2. After that, post an update at least every 30
minutes for SEV1 and every 60 minutes for SEV2, even when there is nothing new. Say "no change" in
that case.

Rules for the text:

- Write about what users see, not about the internal cause. Do not name people, customers, or vendors in a way that blames them.
- Do not guess a time for the fix. Give the time of the next update.
- Use UTC times.
- Keep each update to three sentences or less.

### Investigating

> We are investigating reports that **[what users see, for example "remote hosts show as offline"]**.
> **[Who is affected, for example "Some users"]** may be affected. We will post an update by **[HH:MM UTC]**.

### Identified

> We have found the cause of **[what users see]**: **[cause in plain words, for example "a change we
> deployed at 14:02 UTC"]**. We are **[fix, for example "rolling back that change"]**. We will post an update by **[HH:MM UTC]**.

### Monitoring

> We have applied a fix for **[what users see]**, and **[the service]** is working again. We are
> monitoring the results. **[Action for users, if any, for example "If your host still shows offline, restart Superset."]**

### Resolved

> This incident is resolved. **[What users saw]** from **[HH:MM]** to **[HH:MM UTC]**.
> **[One sentence about the cause and what we will change.]** We are sorry for the disruption.

## Communication checklist

When you declare:

- [ ] Open an incident channel or thread, and post the severity, the lead, and a one-line summary.
- [ ] Post "Investigating" on status.superset.sh (SEV1 and SEV2).
- [ ] Tell support (Plain) and Discord moderators, so that they link the status page in replies and do not guess.

During the incident:

- [ ] Post updates on the schedule above.
- [ ] Record the timeline in the incident channel: times, actions, and who did them.
- [ ] To stop deploys, run `gh workflow disable "Deploy Production"`, and post that you did it.
      This does not stop a run that is queued or in progress. Find them with
      `gh run list --workflow "Deploy Production" --status queued` and `--status in_progress`,
      and cancel each with `gh run cancel <id>`. Do not cancel a run while its `deploy-database` job applies a migration,
      unless the migration is the cause.

When it is resolved:

- [ ] Post "Resolved" on the status page.
- [ ] Enable deploys again if you disabled them.
- [ ] Reply to the support threads and Discord posts that the incident caused.
- [ ] For SEV1 and SEV2, write a post-mortem in 48 hours or less: timeline, cause, effect, and follow-up tickets (use the `ticket-format` skill).
