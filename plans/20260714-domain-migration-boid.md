# Domain Migration & Rebrand: superset.sh → boid.so — code reference

> **Canonical tracker is the Notion page** ("Domain Migration & Rebrand: superset.sh → boid.so").
> Status, handoffs, DNS records, and progress live there. This file is a **code-only appendix** —
> the env-var flip list, hardcoded-leak files, OAuth manifests, and host map — for engineers.
> Don't track live status here; update Notion.

---

## TL;DR — how cutover actually works

The app, marketing, docs, relay, api, and desktop layers are **already env-driven** (per-app
`env.ts` + `defineEnv` fallbacks). So the primary cutover is: **set the domain env vars to boid.so
values in each Vercel/deploy environment.** Defaults stay `superset.sh` in code, so nothing changes
until the env is flipped — safe to dual-run.

Only a handful of **hardcoded leaks** need code changes (below). One is already done:
`packages/shared/src/constants.ts` now derives every domain URL from `NEXT_PUBLIC_ROOT_DOMAIN`
(default `superset.sh`).

---

## 1. Env-var flip list (the cutover switch)

Set these per app (Vercel project env / deploy env). Old default → new value:

| Env var | Old default | New value | Consumers |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `superset.sh` | `boid.so` | shared `constants.ts` (DOMAIN, EMAIL_DOMAIN, status/trust/mailto) |
| `NEXT_PUBLIC_MARKETING_URL` | `https://superset.sh` | `https://boid.so` | marketing, web, docs, email, desktop |
| `NEXT_PUBLIC_WEB_URL` | `https://app.superset.sh` | `https://app.boid.so` | api, web, desktop, admin |
| `NEXT_PUBLIC_API_URL` | `https://api.superset.sh` | `https://api.boid.so` | ~all apps |
| `NEXT_PUBLIC_DOCS_URL` | `https://docs.superset.sh` | `https://docs.boid.so` | marketing, desktop, shared |
| `NEXT_PUBLIC_STREAMS_URL` | `https://streams.superset.sh` | `https://streams.boid.so` | desktop |
| `NEXT_PUBLIC_ADMIN_URL` | `https://admin.superset.sh` | `https://admin.boid.so` | api, auth |
| `NEXT_PUBLIC_DESKTOP_URL` | (app) | boid.so equivalent | api, auth |
| `NEXT_PUBLIC_ELECTRIC_URL` | electric host | boid.so equivalent | desktop |
| `RELAY_URL` / `NEXT_PUBLIC_RELAY_URL` | `https://relay.superset.sh` | `https://relay.boid.so` | web, api, desktop, mobile, cli, host-service, trpc |
| `SUPERSET_API_URL` | `https://api.superset.sh` | `https://api.boid.so` | cli, host-service |
| `SUPERSET_WEB_URL` | app url | boid.so equivalent | cli |
| `SUPERSET_HOST_AGENT_HOOK_URL` | api-derived | boid.so equivalent | host-service, agent hooks |

- [ ] Populate boid.so values in every Vercel project (app, api, marketing, docs, admin, relay)
- [ ] Update CLI/host-service/desktop build env for boid.so
- [ ] Keep superset.sh envs on the OLD deployments so both run in parallel

---

## 2. Hardcoded leaks to fix (code)

- [x] **`packages/shared/src/constants.ts`** — derive all domain URLs from `NEXT_PUBLIC_ROOT_DOMAIN` ✅ *done*
- [x] **`apps/web/next.config.ts`** — `relay-backup.superset.sh` now env-driven via `RELAY_BACKUP_URL` (prod default stays superset.sh) ✅ *done*
- [ ] **`apps/desktop/electron.vite.config.ts`** — `defineEnv` fallbacks `api./streams./app./docs.superset.sh` (lines ~58–74, 175–191). Env-overridable already; just set boid.so at build. Consider changing fallbacks post-cutover.
- [ ] **`apps/desktop/src/renderer/index.html`** — hardcoded `https://relay-backup.superset.sh` in CSP `connect-src` (line ~20). Add boid.so backup origin.
- [ ] **`packages/sdk/src/client.ts`** — published SDK defaults `https://api.superset.sh` / `https://relay.superset.sh` (lines ~268, 308). Both hosts will alias, so change in a **later SDK release**, not at cutover.
- [ ] **Grep sweep** for any remaining literal `superset.sh` in `src/` after the env flip

---

## 3. OAuth / integration manifests (add boid.so alongside — don't remove old)

- [ ] **Slack** — `apps/api/src/app/api/integrations/slack/manifest.json`: add boid.so `redirect_urls`, `request_url` (events + interactions), `unfurl_domains`. Re-apply manifest in Slack app config.
- [ ] **GitHub App** — add `https://api.boid.so/...` + `https://app.boid.so/...` callback/setup URLs in the GitHub App settings
- [ ] **Google OAuth** — add boid.so authorized redirect URIs + update OAuth consent-screen app domain/homepage
- [ ] **Linear** — add boid.so redirect URL in the Linear OAuth app
- [ ] **Stripe** — update branding + webhook/return URLs
- [ ] Verify each provider end-to-end on boid.so before removing superset.sh callbacks (removal is post-cutover)

---

## 4. Host / subdomain map (for 301s + DNS)

| Old host | New host | Cutover mechanism |
| --- | --- | --- |
| `superset.sh` | `boid.so` | Vercel domain + `NEXT_PUBLIC_ROOT_DOMAIN`/`MARKETING_URL`; 301 path-preserving |
| `app.superset.sh` | `app.boid.so` | `NEXT_PUBLIC_WEB_URL` |
| `api.superset.sh` | `api.boid.so` | `NEXT_PUBLIC_API_URL` |
| `docs.superset.sh` | `docs.boid.so` | `NEXT_PUBLIC_DOCS_URL` |
| `relay.superset.sh` | `relay.boid.so` | `RELAY_URL` |
| `relay-backup.superset.sh` | `relay-backup.boid.so` | hardcoded → fix (§2) |
| `streams.superset.sh` | `streams.boid.so` | `NEXT_PUBLIC_STREAMS_URL` |
| `admin.superset.sh` | `admin.boid.so` | `NEXT_PUBLIC_ADMIN_URL` |
| `status.superset.sh` | `status.boid.so` | constants (done) + status provider |
| `trust.superset.sh` | `trust.boid.so` | constants (done) + provider |
| `open-in-superset.sh` (deep link) | boid.so equivalent | docs + Linear deep-link |

### Redirect strategy

- [ ] **301 path-preserving** per host: `https://<host>.superset.sh/*` → `https://<host>.boid.so/*`
- [ ] Marketing + docs: implement in `next.config` `redirects()` or Vercel domain redirect on the OLD deployment
- [ ] Never redirect to homepage; map to the equivalent path (soft-404 risk)
- [ ] Generate a per-URL diff from the marketing sitemap; spot-check top-traffic pages
- [ ] Keep superset.sh deployments alive **only** to serve redirects for 2–3 years

---

## 5. DNS + email warm-up runbook (boid.so)

> **Current state (checked 2026-07-14 via dig + dashboards):**
> - boid.so registered at **Namecheap** — NS `dns1/dns2.registrar-servers.com` (BasicDNS)
> - Parked: `A boid.so → 192.64.119.208` (Namecheap parking)
> - Namecheap email forwarding already live: MX `eforward{1-5}.registrar-servers.com`, TXT `v=spf1 include:spf.efwd.registrar-servers.com ~all`
> - **Not** on Vercel yet (Superset Vercel team = `team_5CLWP9cJw0fMNffIbyM6EVwM`, projects: marketing/web/api/docs/admin)
> - **GSC**: boid.so Domain property created (unverified). Verification TXT to add:
>   `google-site-verification=iAtJxV3VlUCUbtiUWMM20AKlZf1O3RyhAuRA7nRZeLs`
> - **DECISION MADE:** move boid.so DNS to **Vercel** (full nameserver move). boid.so added to Vercel `marketing` project (apex).
> - **⏳ ONE ACTION NEEDED FROM KIET — switch nameservers at Namecheap:** set boid.so to Custom DNS →
>   `ns1.vercel-dns.com` + `ns2.vercel-dns.com` (replacing `dns1/dns2.registrar-servers.com`). This unblocks everything below; propagation up to a few hours.
> - After propagation, Vercel hosts the zone and all records (subdomains, email SPF/DKIM/DMARC, GSC TXT) are added in Vercel DNS.
> - *(Alt if keeping Namecheap DNS: add `A @ → 216.150.1.1` + delegate subdomains — not chosen.)*
> - **Vercel domains pre-wired (2026-07-14):** `boid.so`→marketing, `app.`→web, `api.`→api, `docs.`→docs, `admin.`→admin. All "Invalid Configuration" until NS switch; they auto-configure once boid.so is on Vercel DNS.
> - **Still on Namecheap-parked / to add in Vercel DNS post-switch:** `relay.` + `relay-backup.` (A→Fly), `streams.`, email SPF/DKIM/DMARC, GSC TXT.


> Email warm-up is the long-lead item — **start now**, weeks before cutover. Full playbook + ramp
> schedule live in the Notion page (Phase 4). This is the record-level checklist.

### DNS records to publish on boid.so

- [ ] **A/AAAA/CNAME** for `boid.so`, `app.`, `api.`, `docs.`, `relay.`, `relay-backup.`, `streams.`, `admin.` (point at Vercel/Fly hosts)
- [ ] **SSL** auto-provision + verify HTTPS on every subdomain
- [ ] Lower **TTL to 300s** on both zones 48h before cutover

### Email (Resend) — DONE: root `boid.so` added, mirroring superset.sh

> superset.sh's Resend setup = root `superset.sh` + `hey.superset.sh` subdomain, both verified us-east-1.
> Mirrored by adding **root `boid.so`** (transactional from `@boid.so`). Resend domain id
> `2054288e-ed6d-41ce-af7b-4749c6759673` (resend.com/domains/…). Sending ON, Receiving OFF (inbound
> stays on Google Workspace). Optional `hey.boid.so` marketing subdomain can be added later.

- [x] boid.so added to Resend (us-east-1), sending enabled ✅ *done 2026-07-14*
- [ ] **Add these records in Vercel DNS** (after NS switch), then click **Verify** in Resend:
	- [ ] DKIM: TXT `resend._domainkey` = `p=MIGfMA0G…QIDAQAB` (**copy full value from the Resend domain page** — key is too long to transcribe)
	- [ ] SPF bounce: MX `send` = `feedback-smtp.us-east-1.amazonses.com` (priority 10)
	- [ ] SPF: TXT `send` = `v=spf1 include:amazonses.com ~all`
	- [ ] DMARC: TXT `_dmarc` = `v=DMARC1; p=none;`
- [ ] *(Optional later)* enable Receiving → MX `@` = `inbound-smtp.us-east-1.amazonaws.com` — skip; inbound goes to Google Workspace
- [ ] One-click unsubscribe (RFC 8058) on bulk mail
- [ ] Google Postmaster Tools registered for boid.so
- [ ] Begin ramp: 150/day → ×1.4/step, most-engaged users first; hold if spam >0.08% or bounce >4%

### Inbound mail — Google Workspace (receiving at `@boid.so`)

> Resend = **sending only**. To *receive* at `kiet@boid.so`, `support@boid.so`, etc., boid.so must be
> added to Google Workspace. superset.sh inbound = Google Workspace (apex MX `smtp.google.com`).

- [ ] In **admin.google.com** (needs Workspace admin), add `boid.so` as a **domain alias of superset.sh**
	- alias → every existing `@superset.sh` user instantly also receives `@boid.so` in the *same* inbox (best for a rebrand). *(Secondary domain = separate accounts; not what we want.)*
- [ ] Add Google's **verification TXT** + **MX records** for boid.so → Vercel DNS (after NS switch)
- [ ] **Apex SPF must cover BOTH Gmail and Resend/SES** — mirror superset.sh's apex:
	`v=spf1 include:_spf.google.com include:amazonses.com ~all`
	*(distinct from the `send.boid.so` SPF above, which is SES-only)*
- [ ] apex MX → Google; `send.boid.so` MX → SES feedback (no conflict — different hosts)
- [ ] Later: set users' **send-as / “from” address** + signatures to `@boid.so`; eventually make boid.so the **primary** Workspace domain
- [ ] Google OAuth consent screen: add boid.so as an authorized/app domain (see §3)

### Email addresses to migrate (from audit)

`noreply@` · `support@` · `founders@` · `hi@` · `legal@` · `privacy@` (+ `satya@` in a script).
Update in: `packages/auth/src/server.ts`, `packages/shared/src/constants.ts` (done via EMAIL_DOMAIN),
`packages/email/*`, `apps/marketing/{contact,enterprise}/actions.ts`, legal MDX, mobile `store.config.json`,
`apps/desktop/package.json`.

---

## 6. Brand / content (lower priority, post-infra)

- [ ] Social handles in `constants.ts` (X `superset_sh`, LinkedIn, YouTube) — external, update by hand once new handles exist
- [ ] `README.md` (32 refs incl. `docs.superset.sh` badges), `CODE_OF_CONDUCT.md`
- [ ] Marketing blog/legal MDX content mentions
- [ ] Logos, wordmark, favicon, OG images across marketing/docs/app/desktop
- [ ] Skill/plugin docs (`skills/superset/`, `plugins/superset/`)

---

## 7. Baseline capture + monitoring (day-of)

- [ ] Export pre-migration GSC data, organic traffic, rankings, email deliverability baseline
- [ ] Add + verify boid.so in Google Search Console + Bing (before Change of Address)
- [ ] File GSC **Change of Address** superset.sh → boid.so **after** 301s are live
- [ ] Watch: Change-of-Address status, 404s/redirect chains, sign-in success, email bounce/spam
- [ ] Rollback = re-point primary env/traffic to superset.sh (same backend, instant)
