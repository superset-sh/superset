# Account Switcher + Live Rate-Limit Meter — Implementation Spec

Playbook item 7 ([Orca Growth Playbook](https://app.notion.com/p/3b3b9d5bf6168118b9d2f87119572e67), in Notion under Growth). Orca's most screenshot-able feature; every multi-account user's pain, timed to Anthropic/OpenAI limit tightening.

Mechanics cross-checked against Orca's shipped implementation (MIT, `stablyai/orca`) on 2026-08-05 — used as a reference for provider behavior and hazards only; all code here is ours.

## Problem

- Users with multiple Claude Code / Codex subscriptions (personal + work, or several Max accounts) can't pick which account an agent session runs under. The CLI silently uses whatever `~/.claude` / `~/.codex` holds; switching means `/logout` + `/login` globally, killing every other session's auth.
- There is no visibility into rate-limit consumption. Users discover a exhausted 5h window only when the agent stalls mid-task, and have no timer for when it resets.
- Nothing in the product touches this today: `CLAUDE_CONFIG_DIR`/`CODEX_HOME` appear only in tests, and the only credential-aware code is read-only detection (`packages/host-service/src/providers/model-providers/LocalModelProvider/utils/resolveAnthropicCredential.ts:22-60`).

## Key insight (why this is cheap here)

Both CLIs scope **all** state — auth, sessions, settings — to one env var: `CLAUDE_CONFIG_DIR` (Claude Code) and `CODEX_HOME` (Codex). An "account" is just an isolated config dir plus that env var at launch. Superset already has every layer needed:

- `HostAgentConfig.env` persists per-config env and is applied at launch as a shell prefix: `envOverlayPrefix({ ...config.env, ...modelEnv })` at `packages/host-service/src/trpc/router/agents/agents.ts:329`.
- `buildAgentModelEnv` (`packages/shared/src/agent-models.ts:306`) is the exact precedent for a per-launch env overlay keyed by presetId.
- The OpenCode wrapper already exports a scoped config dir (`apps/desktop/src/main/lib/agent-setup/agent-wrappers-claude-codex-opencode.ts:500-507`) — same pattern, different var.

## Proposed UX

1. **Accounts manager** — new "Accounts" section in Settings → Agents (`apps/desktop/src/renderer/routes/_authenticated/settings/agents/components/V2AgentsSettings/`). Per provider (Claude, Codex): list accounts with label + plan tier + usage bar; "Add account" opens a terminal with the profile's config dir pre-set and runs the CLI's login (`CLAUDE_CONFIG_DIR=<dir> claude /login`); the existing `~/.claude` becomes the implicit "Default" account (no env override).
2. **Pick account at launch** — account submenu on preset-bar items (`.../v2-workspace/$workspaceId/components/V2PresetsBar/V2PresetsBar.tsx`) and a default-account per agent config. Plain launch uses the account marked default.
3. **Per-session switcher** — account chip in the terminal pane title row next to `TerminalSessionDropdown` (`.../hooks/usePaneRegistry/usePaneRegistry.tsx:352-363`). Clicking opens a dropdown of accounts, each row showing its live usage meter. Selecting another account **relaunches the CLI in the same terminal** under the new env, using `claude --continue` / `codex resume --last` to keep the conversation (env is fixed at process start; there is no true in-process swap — see open questions).
4. **Rate-limit meter** — small chip in `TerminalPaneHeaderExtras` (`.../TerminalPane/components/TerminalPaneHeaderExtras/TerminalPaneHeaderExtras.tsx:24-64`), patterned on `TerminalConnectionIndicator` (amber/red severity dot) and `ResourceConsumption`'s `MetricBadge`/`UsageSeverityBadge` (`.../TopBar/components/ResourceConsumption/`). Shows `62% · resets 2h 10m`; popover breaks down 5h window / weekly / plan tier. When a session's account crosses ~90%, the chip goes amber and the switcher suggests the least-used account.

## Data model

New host-service SQLite table (accounts live on the host, next to `hostAgentConfigs` in `packages/host-service/src/db/schema.ts:154`):

```
agent_accounts
  id            text PK
  preset_id     text        -- "claude" | "codex" (builtin ids from packages/shared/src/builtin-terminal-agents.ts)
  label         text        -- "Personal Max", "Work"
  config_dir    text        -- absolute; null = provider default (~/.claude, ~/.codex)
  is_default    integer
  created_at / last_used_at
```

- Managed config dirs live under `~/.superset/agent-accounts/<presetId>/<accountId>/`.
- Env mapping is a static per-preset function: claude → `{ CLAUDE_CONFIG_DIR: dir }`, codex → `{ CODEX_HOME: dir }` (mirror `buildAgentModelEnv`, e.g. `buildAgentAccountEnv(presetId, account)` in `packages/shared`).
- Which account a live session runs under: add `accountId` to the terminal-agent binding (`packages/host-service/src/trpc/router/terminal-agents/terminal-agents.ts:40-136`) — bindings are already the per-terminal agent state channel the renderer reads (`apps/desktop/src/renderer/hooks/host-service/useTerminalAgentBindings/`).
- Usage snapshots: in-memory cache in host-service keyed by accountId (`{ windows: [{label, usedPercent, resetsAt}], planTier, fetchedAt }`); no table needed for v1.

### Rate-limit data sources (verified locally 2026-08-04; cross-checked against Orca's shipped source 2026-08-05)

**Claude — HTTP usage endpoint (primary)**
- `GET https://api.anthropic.com/api/oauth/usage`, headers `Authorization: Bearer <accessToken>`, `anthropic-beta: oauth-2025-04-20`, `User-Agent: claude-code/<version>`.
- Response shape (from Orca's parser): `five_hour` and `seven_day` objects each `{utilization | used_percentage, resets_at}`, plus a newer `limits[]` array of `{kind, percent, resets_at, is_active, scope.model.display_name}` where `kind === 'weekly_scoped'` carries the per-model (Opus-tier) weekly window; older builds expose that window as separate legacy top-level fields instead. Prefer `limits[]`, fall back to legacy fields. `resets_at` is epoch seconds or ms (disambiguate at a 1e10 threshold) or an ISO string. **No plan tier in this response.** Exact field names shift across CLI versions — pin them against the installed CLI at implementation time and treat unknown fields as absent, not as errors.
- Missing windows + a valid token means API-key billing, not an error: render "no subscription plan" rather than a broken meter.
- Ignore the locally stored `expiresAt` for this call; credentials often still authenticate past it. Let the server decide.

**Claude — statusline live feed (free, no polling)**
- Recent Claude Code builds pipe `rate_limits: {five_hour, seven_day}` into the configured `statusLine` command on every turn. Installing a managed statusline script that POSTs this to a local endpoint gives live in-session usage with zero API calls, attributed by the session's `CLAUDE_CONFIG_DIR`. Orca does exactly this and suppresses HTTP polling whenever a statusline post is fresher than 5 minutes. Worth doing in M3 — it is the cheapest source and the only truly live one.

**Claude — PTY fallback**
- When OAuth fails or creds are API-key-only, usage can be scraped from a hidden `claude` PTY driven to `/usage`. Orca also uses it to supplement the Opus weekly window when the endpoint omits it. Expensive and brittle (TUI regex parsing); treat as last resort, and see the PTY hazards under "Answered by Orca's source".

**Codex**
- Preferred: JSON-RPC against `codex app-server` (`codex -s read-only -a untrusted app-server`, method `account/rateLimits/read`). Scope the account by setting `CODEX_HOME` on the spawned child only.
- Supplement: `GET https://chatgpt.com/backend-api/wham/usage` with the bearer token and `ChatGPT-Account-Id` from that home's `auth.json` — needed because older app-servers return only the weekly window, and it is the only source of `plan_type` and reset credits.
- Rollout-JSONL tailing (`$CODEX_HOME/sessions/**/rollout-*.jsonl` → `rate_limits`) still works and needs no subprocess. Cheapest option for v1; the RPC/HTTP paths are the upgrade if JSONL proves stale between sessions.
- Serialize probes per home: two concurrent probes against one `auth.json` can race a token refresh.

**Poll cadence** (Orca's, worth copying): 15 min interval, and only while the app window is visible and focused. Refresh on focus/resume if data is older than 5 min. Per-provider exponential backoff on failure (30s doubling, capped at the poll interval). Honor `Retry-After` on 429 and keep serving the stale snapshot (they extend staleness tolerance from 30 min to 24h while rate-limited). Force a refresh on account add/remove/switch. Our agent Stop/StopFailure hooks are an additional trigger Orca lacks.

## Integration points

| Layer | Where | Change |
|---|---|---|
| Launch env (Paths B/C/D: agents.run, automations, SDK/MCP/CLI, workspace-create chain) | `packages/host-service/src/trpc/router/agents/agents.ts:329` (`buildTerminalAgentLaunch`) | merge `...accountEnv` into `envOverlayPrefix({ ...config.env, ...modelEnv })`; add optional `accountId` to `AgentRunInput` (`agents.ts:157`) |
| Launch env (Path A: preset bar, no prompt) | `apps/desktop/src/renderer/lib/agent-launch-command.ts:37` (`getAgentCommandText`) + `useV2PresetExecution` → `useV2TerminalLauncher.ts:42-48` | accept env overlay when composing the command string; preset schema already links `agentId` (`.../CollectionsProvider/dashboardSidebarLocal/schema.ts:213-232`) |
| Env prefix helper | `packages/shared/src/agent-prompt-launch.ts:51` (`envOverlayPrefix`) | reuse as-is; `CLAUDE_CONFIG_DIR`/`CODEX_HOME` pass the PTY env-strip untouched (`packages/host-service/src/terminal/env-strip.ts` strips only `SUPERSET_*`/runtime keys) |
| Accounts CRUD + usage API | new `agentAccounts` router beside `packages/host-service/src/trpc/router/settings/agent-configs.ts:174`, registered in `router.ts:27-54` | `list / add / remove / setDefault / usage` (+ subscription for meter updates) |
| Session→account binding | `packages/host-service/src/trpc/router/terminal-agents/terminal-agents.ts:108` (`getOrCreate`) | carry `accountId` on the binding |
| Switcher UI | `usePaneRegistry.tsx:352-363` (`renderTitle`) | account chip + dropdown; relaunch = write `--continue` launch into existing session (`queueInitialCommand` pattern, `packages/host-service/src/terminal/terminal.ts:857-886`) |
| Meter UI | `TerminalPaneHeaderExtras.tsx:24-64`; pattern from `ResourceConsumption/components/{MetricBadge,UsageSeverityBadge}` | severity chip + popover |
| Settings UI | `V2AgentsSettings.tsx` + `AgentDetail.tsx` | Accounts section; default-account select per config |
| Credential read | `LocalModelProvider/utils/resolveAnthropicCredential.ts:22-60` (+ `resolveOpenAICredential.ts`) | parameterize config dir; reuse for usage polling |

Non-goals for v1: v1 desktop UI (sunset), other agents (gemini/copilot/etc. can follow the same env-var pattern later), team/cloud account sharing, API-key accounts (OAuth subscriptions only).

## Answered by Orca's source (studied 2026-08-05, MIT — reference only, we write our own)

1. **macOS Keychain — isolation works, with a catch.** Claude Code 2.1+ scopes the Keychain item per config dir: service name is `Claude Code-credentials-<first 8 hex of sha256(CLAUDE_CONFIG_DIR)>`, with the unsuffixed legacy service as fallback. So two accounts under two `CLAUDE_CONFIG_DIR`s do **not** clobber each other on current CLIs. Read via `security find-generic-password -s <service> -a $USER -w`; try scoped first, then legacy. Older CLIs ignore `CLAUDE_CONFIG_DIR` and write the legacy item, so a login flow must snapshot the legacy item before login and detect a change to attribute the new creds. Note Orca's own model differs from ours: they materialize one selected account into the shared `~/.claude` + Keychain rather than launching per-account config dirs. Our env-overlay approach is simpler and avoids their whole read-back/ownership-marker apparatus — keep it, and rely on the scoped Keychain service for isolation.
2. **Hot-swap: don't.** Orca does not swap live sessions. On switch they scan for live panes on the old account and show a blocking per-pane overlay ("still signed in as X, restart to use Y, it stays on the old account until you do") with Restart / Keep-old-account, and the restart drops the in-flight conversation entirely. Adopt the honest-prompt UX; our `--continue` / `resume --last` relaunch is strictly better than their bare restart, so offer it as the restart path rather than promising a seamless swap.
3. **Usage endpoint stability + token refresh.** Ship graceful degrade: classify errors and react per class — 429 is terminal for the window (honor `Retry-After`), 401 means stale token (repair, then retry), 403 mentioning a missing scope is terminal, 5xx/network/parse fall back to another source. Orca refreshes OAuth themselves against `POST https://platform.claude.com/v1/oauth/token` (`grant_type=refresh_token`, form-encoded) with Claude Code's public client id, precisely because refresh tokens are **single-use** and must be rotated and persisted atomically. Critical consequence: **never refresh while a live Claude PTY is running** for that account — the CLI will rotate the same single-use token and one of you loses. Orca defers the refresh and retries when the last live PTY for that account exits. If we would rather not own refresh at all, the alternative is their "delegated refresh": spawn the CLI, let it refresh, re-read creds, retry.
4. **Adopted sessions**: unchanged from our analysis, and Orca hits the same issue — they persist a pane→account registry and re-detect stale panes after an app restart. Read the account off the binding, never off the current default.
5. **Default account stays in place.** Orca's Codex overhaul landed on exactly this: the default account runs directly against the user's own `~/.codex` with no env injection, and only non-default accounts get a self-contained `CODEX_HOME` (mirroring the real home's config in, never mutating it). Same for Claude with `CLAUDE_CONFIG_DIR`. Confirms our lean.
6. **Meter placement — and where to leapfrog.** Orca puts per-provider chips in a status bar plus a roster popover listing one row per agent, sorted worst-first, with the account switcher inline (each inactive account showing mini usage bars, fetched lazily on dropdown open with a 60s debounce). Severity: neutral below 60%, amber 60–79%, red 80%+. They show plan tier for Codex only. **They have no aggregate view across accounts** — every surface is scoped to the active account per provider, and their architecture actively avoids keeping inactive accounts fresh. This is the gap their users complain about, so a real "all accounts, all windows" summary is our differentiator, not a stretch goal.

### Hazards to inherit for free (learned from their code)

- Hidden PTY probes: disable on Windows (ConPTY crashes), send the command and the Enter keystroke as separate writes (a single write coalesces into a paste), expect to nudge periodically because the prompt character never reliably anchors, and on cleanup kill before destroy — neutralizing the terminal's `kill` first, since node-pty's destroy re-kills and pid reuse can signal an innocent process.
- Never mutate `process.env` to scope an account; set the env on the spawned child only.
- Guard against a raced in-flight fetch overwriting a just-switched account (generation counter or provenance tag on each snapshot).
- Strip inherited auth env (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, and friends) when launching under a managed account, or the key silently wins over the account.

## Remaining open questions

1. Do we own OAuth refresh (atomic, needs the client id, must respect the live-PTY rule) or use delegated refresh via the CLI? Leaning delegated for v1: less to get wrong, no client-id dependency.
2. Statusline live feed in v1 or v3? It is the cheapest and most live source, but it means installing a managed statusline script into each account's settings — a write into user config we should be deliberate about.
3. Aggregate meter scope: all accounts of one provider, or true cross-provider "here is every quota you own"? The second is the actual differentiator and needs the inactive-account polling Orca refuses to do (their reason: rotating refresh tokens — mitigated if we use read-only sources like JSONL/statusline for inactive accounts).

## Milestones

- **M0 — Spike (half day, was 1–2 d)**: the Keychain question is answered in principle, so this is now confirmation not investigation. Two real Claude logins under separate `CLAUDE_CONFIG_DIR`s; verify the scoped Keychain service name against the installed CLI version; pin the live `/api/oauth/usage` field names; codex login under a custom `CODEX_HOME`; confirm `--continue` / `resume --last` behave across config dirs.
- **M1 — Accounts backend (2–3 d)**: `agent_accounts` table + router; `buildAgentAccountEnv`; overlay at `agents.ts:329` + `AgentRunInput.accountId`; add-account login flow (temp config dir → login → capture creds → persist); strip inherited auth env under a managed account.
- **M2 — Switcher UI (2–3 d)**: settings Accounts section; pane-title account chip + restart-to-switch flow (honest prompt, `--continue` relaunch); account on binding, surviving adopt/restart; Path A (preset bar) env threading.
- **M3 — Rate-limit meter (2–3 d)**: host-service usage poller (Claude endpoint + Codex JSONL, 15 min / focus-gated / backoff / Retry-After); error classification; `agentAccounts.usage` query/subscription; header chip + popover + switcher meters; 60/80 thresholds.
- **M4 — Aggregate view + launch polish (2 d)**: the cross-account "every quota you own" summary Orca does not have; "limit hit → switch account" suggestion on StopFailure; changelog + demo video (the screenshot: two accounts, live meters, one-click swap mid-session).
