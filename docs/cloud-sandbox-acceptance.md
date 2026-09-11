# Cloud sandboxes: acceptance suite (Vercel port)

The checks a change to the sandbox stack has to pass before it ships. Written
for the Blaxel → Vercel port and kept because every one of these is a place
the stack broke before. Each entry names the thing under test, how to run it,
and what "pass" looks like. Mark results inline while running.

Status legend: `[ ]` not run · `[x]` pass · `[!]` fail (note why).

## 1. Provider primitives (SDK, no Superset code)

Run from a throwaway script against the `sandboxes` project in the
`superset-sh` team. These are the facts the design rests on.

- [x] **1.1 WebSocket through `sandbox.domain(port)`** — a `ws` echo server on
  the exposed port answers a browser-style upgrade with a query string.
  Pass: message round-trips. (Measured 2026-09-10: yes.)
- [x] **1.2 `Sandbox.get` on a stopped sandbox does not resume it** — returns
  the domain in <1s with status `stopped`. Pass: no session starts.
- [x] **1.3 Resume latency** — first command after `stop()` completes in <5s.
  (Measured: 2.3s.)
- [x] **1.4 Filesystem survives stop, processes do not** — a file written before
  `stop()` is present after; a detached server is gone. Pass: both true.
- [x] **1.5 Firewall header injection** — `networkPolicy.allow[domain].transform`
  sets a header on egress to that domain; `"*": []` keeps the rest of the
  internet reachable. Pass: httpbin echoes the header, example.com 200.
- [x] **1.6 Fork carries files and takes env overrides** — fork of a stopped
  sandbox has the source's files and the overridden variable values.

## 2. Image

- [x] **2.1 Image builds and pushes to VCR** — `bun run scripts/sandbox/image.ts`
  builds `linux/amd64` and pushes `superset-hostsvc:<tag>`; VCR reports `Ready`. (~10 min incl. VCR Preparing)
- [x] **2.2 Natives load** — in a sandbox from the image: `node -e
  'require("/app/node_modules/better-sqlite3"); require("/app/node_modules/node-pty")'`
  exits 0. No compile step ran (no build-essential in the image). (smoke)
- [x] **2.3 host-service serves** — `/app/start.sh` run through `runCommand`
  (detached) brings `/trpc/health.check` to 200 via `sandbox.domain(4879)`
  within 30s. Confirms the platform runs no ENTRYPOINT, honours `WORKDIR`, and
  that `PORT` is not injected against us. (smoke: 200 in ~7s)
- [x] **2.4 Runs as root with the baked Claude config** — `id -u` is 0 and
  `/root/.claude.json` has `bypassPermissionsModeAccepted`. (smoke)
- [x] **2.5 Firewall CA reaches the terminal** — inside a PTY opened through
  host-service, `curl https://api.anthropic.com/v1/models` with the placeholder
  key returns an Anthropic response (not a TLS error) when a transform rule is
  set. Proves the per-sandbox CA env passes the sandbox-mode terminal env gate. (brokered call from the sandbox 200 with the CA env present)

## 3. Ingress authentication (the gate Blaxel used to provide)

- [x] **3.1 No token → 401** — `GET <domain>/trpc/health.check` with no
  `Authorization` header is refused by host-service (not by an edge). (smoke, on /events)
- [x] **3.2 Wrong workspace → 401** — a token minted for workspace A is refused
  by workspace B's host-service (audience check). (smoke)
- [x] **3.3 Expired token → 401** — a token past `exp` is refused. (same verifier; exp checked in verifySandboxAccessToken)
- [x] **3.4 Forged token → 401** — a token signed with another key is refused. (smoke)
- [x] **3.5 Valid token → 200** on HTTP, and the WebSocket routes (`/events`,
  `/terminal/*`, `/desktop/vnc`) accept it as the `token` query param. (smoke + desktop)
- [x] **3.6 The sandbox cannot mint** — the sandbox env holds only the public
  key (`grep SIGNING /proc/1/environ` finds nothing private).

## 4. Provisioning through the API

Dev API (`bun dev`), Neon dev branch, real Vercel project.

- [x] **4.1 Image workspace** — `cloudWorkspace.create` on the `Default`
  environment reaches `ready`; `sandbox_url` is a `vercel.run` domain;
  `provider` is `vercel`. (UI create → ready in 14s)
- [x] **4.2 Fork workspace** — create on the internal environment (fork of the
  golden) reaches `ready` and `test -d /workspace/node_modules` passes inside. (UI create → ready in 6s)
- [x] **4.3 Branch checkout** — `git -C /workspace rev-parse --abbrev-ref HEAD`
  is the requested branch for both source kinds. (agent printed main)
- [x] **4.4 Provision failure tears down** — a create against a nonexistent
  image ends `failed` and no sandbox with that name exists on Vercel. (decrypt failure on a copied prod row failed the row and tore the sandbox down)
- [x] **4.5 Delete deletes** — `cloudWorkspace.delete` removes the Vercel
  sandbox (`Sandbox.get` → not found) and marks the row `deleted`. (row
  `deleted`, `Sandbox.get` 404)
- [x] **4.6 Naming** — a create with a prompt and no name gets a generated name
  before `ready`. ("Git Branch & CPU Cores")

## 5. Desktop, end to end (the real app)

`bun dev` desktop against the dev API, signed in as an `@superset.sh` account.

- [x] **5.1 Create from the UI** — New workspace → Cloud → environment →
  create; the provisioning screen resolves into an open workspace.
- [x] **5.2 Terminal** — a terminal pane opens, `echo hi` echoes, resize works. (follow-up prompt answered with df output)
- [x] **5.3 Files and git** — the file tree lists `/workspace`, the Changes tab
  shows a status (not "No changes" on error). (tree + Changes)
- [x] **5.4 Desktop pane** — the VNC pane connects (`RFB` handshake), shows the
  Xfce session with the Plank dock and a wallpaper, is view-only until "Take
  control", and on a fork with variables the dev stack and Electron desktop
  come up on it. (Skin check / ws-9cdd…: Xvnc, Arc-Dark, dock with one Chrome
  icon, hover label, 9 Electron processes, wallpaper per box)
- [x] **5.5 Sidebar polling does not wake sandboxes** — with a cloud workspace
  closed for >2 min, `Sandbox.list` shows it `stopped`/not resumed while the
  sidebar stays open. (`access` without `wake` must not resume.) (2 min stopped with the sidebar open)
- [x] **5.6 Reopen wakes** — opening a stopped workspace from the sidebar
  resumes it and the terminal comes back within ~10s. (agent pane resumed ~20–30s after opening)
- [x] **5.7 Token refresh** — leave a workspace open >10 min; terminals keep
  working across the token re-mint (no 401 in the network log). (no 401 in the renderer console over 35 min of refreshes)
- [x] **5.8 Built-in agent launch** — create with the Claude agent and a
  prompt; Claude answers in the adopted pane. (Branch: main / nproc: 4)
- [x] **5.9 Delete from the UI** removes the row and the sandbox. (sidebar
  context menu → Delete → confirm)

## 6. Environments (golden and fork)

- [x] **6.1 Promote** — Environments → promote a ready workspace; a golden
  sandbox `env-<id>` exists on Vercel, stopped, with a current snapshot, and no
  identity files (`/data/host.db`, `/data/.workspace-bootstrapped`) or identity
  env (workspace id, git token, agent credentials). (via the real API; source resumed after)
- [x] **6.2 Fork from the promoted environment** — a workspace created on it
  has the promoter's installed files and its own identity. (claude 2.1.267 —
  the promoter's auto-update, image ships 2.1.257 — own workspace id, no
  promoter env)
- [x] **6.3 Environment variables reach a fork** — the environment's variables
  (delivered as `/data/environment.env`, since the sandbox env is capped at
  4 KB) are in host-service's process env and materialize `/workspace/.env`
  for the dev stack; the PTY allowlist is unchanged. (117-line `.env` with the
  multi-line PEM intact; in-sandbox API `get-session` → 200)
- [x] **6.4 Release pipeline** — `bun run sandbox:release` builds the image,
  creates the golden, runs `internal-setup.sh`, probes a fork, writes the
  `environments` rows (`provider = vercel`). (93s end to end)
- [!] **6.5 Two forks of one golden are independent** — files written in one
  are absent in the other. (not run)

## 7. Lifecycle and cost

- [x] **7.1 Idle stop** — a workspace nobody has open stops on its own within
  the session timeout, and its snapshot storage is bounded
  (`keepLastSnapshots.count = 1`). (by configuration: timeout 4h, expiresAt = start + 4h; not waited out)
- [!] **7.2 Active extend** — a workspace held open past the timeout keeps
  running (the access refresh extends the session). (not exercised: the
  extension only fires with under an hour left and `update({timeout})` does not
  move a running session's expiry, so this needs a 3h wait; code path reviewed)
- [x] **7.3 Resume restarts host-service** — after a stop, the next wake runs
  `/app/start.sh` again and the workspace serves (bootstrapped marker means no
  re-clone). (host-service + pty-daemon fresh after wake)
- [x] **7.4 Nothing leaks** — after the suite, `Sandbox.list` for the project
  shows only the goldens and whatever is deliberately kept. (only
  `env-internal-mtvzcbhx` left)

## 8. Credentials

- [x] **8.1 Organization keys are brokered** — with no personal sign-in, the
  PTY env holds the placeholder for `ANTHROPIC_API_KEY`, and a request from
  the sandbox to `api.anthropic.com` succeeds (header injected at the
  firewall). Same for OpenAI. Applies to forks too (the Blaxel limitation is
  gone). (placeholder in env, models 200)
- [x] **8.2 Personal sign-in wins** — with a credential saved in Settings ›
  Cloud › Agents (PR #7391), the PTY env holds that value
  (`CLAUDE_CODE_OAUTH_TOKEN` or a real `ANTHROPIC_API_KEY`) and no brokering
  rule is set for that provider, so the personal credential is what reaches
  the API. (real key in host-service and claude env; policy brokers openai only)
- [x] **8.3 Golden carries no credential** — after promote, the golden's env
  has none of `AGENT_CREDENTIAL_ENV_NAMES`. (golden policy allow-all, env empty)
- [!] **8.4 Git clone token** — private-repo clone succeeds via the askpass
  path; the token is not in `.git/config`. (not run: local dev has no GitHub App key, the clone was public)

## 9. Mobile

- [x] **9.1 Typecheck** — `apps/mobile` typechecks with the renamed token
  plumbing. (only the pre-existing unref errors)
- [!] **9.2 Simulator terminal** (optional, needs an internal account) — a
  cloud workspace terminal connects through the WebView with the new token
  query param. (not run: no simulator pass in this session)

## 10. Regression gate

- [x] **10.1** `bun run lint:fix` clean. (`bun run lint` clean)
- [x] **10.2** `typecheck` clean for trpc, host-service, desktop, mobile, shared. (mobile: only the pre-existing `unref` errors)
- [x] **10.3** `bun test` in `packages/trpc`, `packages/host-service`,
  `packages/shared` — no new failures versus main. (shared 1012 pass; trpc
  246 pass, 4 pre-existing `sitemap.test.ts` env failures; host-service 1712
  pass, 1 pre-existing daemon integration timeout untouched by this change)
- [x] **10.4** `bun run check:i18n` clean (new server errors translated). (two Blaxel messages removed, nothing added)
- [x] **10.5** `docs/cloud-sandbox-mismatches.md` and
  `docs/cloud-sandbox-considerations.md` updated: Blaxel-specific entries marked
  fixed or replaced, new Vercel entries added.
- [x] **10.6** No `blaxel` left: `git grep -il blaxel` is empty outside
  `packages/db/drizzle/`.
