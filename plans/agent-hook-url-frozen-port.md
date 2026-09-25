# Agent hook URL frozen-port bug (Maxime Auburtin, 2026-08-13)

Status: root cause confirmed in code; fix implemented (call-time endpoint resolution in the hook scripts). See "Fix" below.

Note: PR #6479 (merged 2026-08-15) moved agent-setup from apps/desktop into packages/agent-setup and provisions hooks on headless CLI hosts; this fix was rebased onto that layout, and file references below use the new paths. The pre-move analysis references (terminal.ts, spawn.ts, coordinator) are unchanged.

## Symptom

`SUPERSET_HOST_AGENT_HOOK_URL` is injected into each terminal's env at creation, carrying the host-service port of that moment. When the host service restarts on a new ephemeral port, every already-running agent POSTs its lifecycle events to a dead port forever. Status silently stops for old agents while new agents work, splitting the fleet.

## Root-cause map (his observations -> code)

| Observation | Code |
| --- | --- |
| Hook URL carries a port captured at terminal creation | `packages/host-service/src/terminal/terminal.ts:165-169` `getHostAgentHookUrl()` reads `process.env.HOST_SERVICE_PORT \|\| PORT` (fixed for the life of the host-service process) and formats `http://127.0.0.1:<port>/trpc/notifications.hook` |
| URL frozen into the agent process env | `terminal.ts:2408-2423` passes it to `buildV2TerminalEnv`; `packages/host-service/src/terminal/env.ts:246-248` sets `env.SUPERSET_HOST_AGENT_HOOK_URL`; the env dict goes to `daemon.open(...)` (`terminal.ts:2461-2468`) and becomes the PTY's immutable process env |
| Terminals survive the restart with the old env | PTYs live in the separate pty-daemon process; a restarted host-service *adopts* live sessions (`terminal.ts:2443-2458`) without touching their env |
| Port differs every restart | Only on the CLI path: `packages/cli/src/lib/host/spawn.ts:112` `options.port ?? findFreePort()` picks a random ephemeral port per start. The desktop coordinator already pins: `getPreferredPorts` tries the in-memory last port, then a deterministic per-org stable port `getStablePortForOrganization` (FNV-1a hash into 48000-48999, `host-service-coordinator.ts:124-131,251-267`), so app restarts normally reuse the same port |
| notify.sh POSTs to the frozen URL | `packages/agent-setup/templates/notify-hook.template.sh:115-131` (curl to `$SUPERSET_HOST_AGENT_HOOK_URL`, exits 0 on any 2xx). Same frozen-URL block in `cursor-hook.template.sh:49-61`, `copilot-hook.template.sh:40-52`, `gemini-hook.template.sh:38-51`. pi (`pi-extension.template.ts`) and amp (`amp-plugin.template.ts`) spawn notify.sh with the agent env, so they inherit the same frozen value |
| Failure is silent | notify.sh swallows curl status unless `SUPERSET_DEBUG_HOOKS=1` (template lines 124-127); the endpoint itself is fine (`packages/host-service/src/trpc/router/notifications/notifications.ts:86-134`, unauthenticated by design) |
| Manifest is fresh the whole time | rewritten on every start by both starters: CLI `spawn.ts:168-175`, desktop child `apps/desktop/src/main/host-service/index.ts:126-138` (`~/.superset/host/<orgId>/manifest.json` with `endpoint` + `authToken`) |

His claim is correct as stated with one nuance: the URL is not "constructed per terminal from a stale source", it is constructed correctly at terminal creation from the *current* host-service port; the freeze happens because process env is immutable and the port is ephemeral per host-service instance.

His three measured ports decode cleanly against this: 48396 is inside the desktop's stable-port range (48000-48999), so agent 1 (Aug 12 21:11) was created under an app-started service on the org's pinned port. 53080 and 54757 are ordinary ephemeral ports from the CLI's `findFreePort()`: the 10:29:50 `superset start --daemon` bound 53080 (agent 2, 10:46), a later restart bound 54757 (agent 3, 12:38). Two CLI restarts, three port lineages. This also explains why desktop-only users rarely hit the bug: the coordinator's port pinning (his suggestion 3) already exists on the desktop path but not in the CLI.

## Secondary findings

### `SUPERSET_AGENT_HOOK_PORT` empty in 2 of 3 agents

- It is the **v1 Electron notifications port** (desktop default 51741, `apps/desktop/src/shared/env.shared.ts:21`).
- Desktop-spawned host-service sets it (`host-service-coordinator.ts:806`); the **CLI spawn does not set it at all** (`packages/cli/src/lib/host/spawn.ts:133-147`), and `terminal.ts:2420` falls back to `""`.
- Maxime's oldest agent (Aug 12 21:11, port 51741) was created under an app-started host-service; the two newer ones were created under the CLI-daemon-started service (10:29:50 restart) so they got "".
- Impact: none in v2. Nothing consumes `SUPERSET_AGENT_HOOK_PORT` in the hook path (notify.sh's v1 fallback uses `SUPERSET_PORT` / baked-in default). Cosmetic/confusing only; not part of this fix.

### `superset start --daemon` logs to /dev/null

- True in 1.20.2: `spawn.ts` used `stdio: "ignore"` for daemon mode.
- Already fixed on main by #6417 (`e266b01ad`, merged 2026-08-13): daemon stdout/stderr now go to the same per-org `~/.superset/host/<orgId>/host-service.log` the desktop writes (rotating, `spawn.ts:117-131`). Not yet in any release; ships with the next CLI/desktop release.

### Relay tunnel proxying a stale port (his "same class" note)

Out of scope here, but he is right that it is the same pattern: the relay connection captures `localPort` at `connectRelay(...)` time (`apps/desktop/src/main/host-service/index.ts:140-149`). It dies with its own process on restart though, so it self-heals; his ECONNREFUSED window was the 87s gap between app-service shutdown and CLI-service start. No code change needed for this bug.

## Repro evidence

### Layer 1: live agents on this dev machine (read-only, 2026-08-13)

This machine runs the same topology as Maxime's. Long-running agents from Aug 2-12 all carry `SUPERSET_HOST_AGENT_HOOK_URL=http://127.0.0.1:48703/...` in their env (`ps eww`), and 48703 is still the live port only because the desktop coordinator pins the per-org stable port across restarts (`manifest.json` startedAt = today, agents up to 11 days older). The freeze mechanism (env captured at creation, never re-resolved) is directly observable; the desktop's port pinning is what masks it until a CLI start breaks the lineage.

### Layer 2: controlled restart (script, run 2026-08-13)

Temp script (`packages/host-service/repro-frozen-hook.ts`, not committed) boots the real host-service `createApp` on a real TCP port twice against the same host.db, builds the terminal env with the real `buildV2TerminalEnv`, and replays the real rendered `notify-hook.template.sh` (SUPERSET_DEBUG_HOOKS=1, v1 fallback pointed at a dead port):

```text
[instance 1] host-service listening on port 62970
[terminal] frozen SUPERSET_HOST_AGENT_HOOK_URL=http://127.0.0.1:62970/trpc/notifications.hook

--- while instance 1 is alive (healthy baseline) ---
[notify-hook] host-service dispatched status=200            <- works

[instance 2] host-service RESTARTED on port 62972 (manifest rewritten)

--- old terminal (frozen env, port 62970) after restart ---
[notify-hook] host-service dispatched status=000            <- dead port
[notify-hook] v1 dispatched status=000                      <- silently dropped, exit 0

--- new terminal (fresh env, port 62972) after restart ---
[notify-hook] host-service dispatched status=200            <- new agents work
```

Exactly Maxime's table: old terminals dead, new terminals fine, zero surfaced errors.

### After the fix (same script, fixed template)

```text
--- old terminal (frozen env, port 65310) after restart ---
[notify-hook] host-service dispatched status=000 url=http://127.0.0.1:65310/trpc/notifications.hook
[notify-hook] host-service dispatched status=200 url=http://127.0.0.1:65314/trpc/notifications.hook  <- healed via manifest
```

The frozen-env terminal falls through the dead env URL and delivers via the manifest endpoint. Because the hook is re-executed from disk on every event, shipping the updated script heals every already-running agent on its next hook fire; no terminal restart needed.

## Fix decision

Chosen: **reporter's suggestion 1**, resolve the endpoint at call time from `~/.superset/host/<orgId>/manifest.json`, implemented inside the hook scripts, keeping `SUPERSET_HOST_AGENT_HOOK_URL` as a fallback.

Why this beats the alternatives:

- **Stable local socket**: correct long-term but a large change (new listener in host-service, curl `--unix-socket` support assumptions, relay/desktop coordination, migration of all four templates plus adoption). Does not heal existing agents any faster than the manifest read, and is far riskier.
- **Port pinning**: reduces but does not eliminate the failure (pinned port can be taken; first bind after upgrade still moves), keeps the architectural flaw, and still leaves a window where old agents point at a dead port.
- **Manifest read at call time** heals **already-running agents on the next hook fire**: the hook is a script re-read from disk on every event, so updating the script on disk fixes live agents without touching their env. Multi-org is handled by probing every org manifest and using the endpoint's own discriminator: `notifications.hook` returns `"ignored":false` only when the terminal id is known to that host (`notifications.ts:96-104`; wrong org / unknown terminal returns `"ignored":true`). The endpoint is unauthenticated by design so no authToken is needed.

### Implementation

All four shell templates get the same dispatch change (repo idiom is to duplicate this block per template):

1. Candidate URLs = `$SUPERSET_HOST_AGENT_HOOK_URL` (fast path; almost always alive and correct) followed by `<endpoint>/trpc/notifications.hook` for each `${SUPERSET_HOME_DIR:-$HOME/.superset}/host/*/manifest.json`, deduped.
2. POST to each candidate in order. Body `"ignored":false` = delivered to the owning host: exit 0.
3. Any 2xx (delivered-but-ignored) still short-circuits the v1 fallback, preserving today's semantics; no 2xx at all falls through to the v1 Electron fallback as before.
4. Connection-refused candidates fail in milliseconds on localhost (`--connect-timeout 2` is an upper bound), so the healthy-path cost stays one curl.

Version markers bumped (content change alone re-writes the file via `writeFileIfChanged`, but markers are the semantic version): notify v8 -> v9, cursor v6 -> v7, copilot v4 -> v5, gemini v5 -> v6.

Files changed:

- `packages/agent-setup/templates/notify-hook.template.sh`
- `packages/agent-setup/templates/cursor-hook.template.sh`
- `packages/agent-setup/templates/copilot-hook.template.sh`
- `packages/agent-setup/templates/gemini-hook.template.sh`
- `packages/agent-setup/src/notify-hook.ts` (marker bump v8 -> v9)
- `packages/agent-setup/src/agent-wrappers-{cursor,copilot,gemini}.ts` (marker bumps v6->v7, v4->v5, v5->v6)
- `packages/agent-setup/src/notify-hook.test.ts` (behavioral tests against a fake host-service over a real port: manifest failover when the env URL is dead, wrong-org skip via ignored:true, env-URL fast path leaves manifests unprobed; plus updated template-content assertions. Tests default `SUPERSET_HOME_DIR` to an empty temp dir so they never probe the developer's real manifests)
- `packages/agent-setup/src/agent-wrappers.test.ts` (marker assertions)

Mutation check (tests can fail): broke the manifest glob (`/host/` -> `/host-broken/`) and reran; the 3 resolution tests failed (manifest failover, wrong-org probe, template assertion) while the 17 others passed. Restored; all 20 pass, and the full agent-setup suite (113 tests) passes.

Deliberately NOT changed:

- `SUPERSET_HOST_AGENT_HOOK_URL` injection stays (older scripts on disk still need it; it is also the fast path).
- CLI `spawn.ts` `SUPERSET_AGENT_HOOK_PORT` gap: cosmetic, nothing consumes it in v2; noted for a separate cleanup.
- Headless hook provisioning shipped independently in #6479 (host-service provisions `~/.superset/hooks` on CLI hosts), so this fix now reaches pure-headless installs too.
- Suggestion 4 (fail loudly in UI) is a good follow-up but is not needed once the address can no longer go stale; filing separately keeps this change reviewable.

## Validation

- `bun test src/main/lib/agent-setup/` (apps/desktop): 113 pass, 0 fail
- Mutation check: broken manifest glob makes 3 tests fail; restored, all pass
- `bun run typecheck`: exit 0
- `bun run lint`: exit 0 (fixed 2 Biome noTemplateCurlyInString warnings and 1 format error the new tests introduced)
- `bash -n` on all four rendered templates: syntax OK
- End-to-end script repro rerun with the fixed template: frozen-env terminal delivers via manifest (transcript above)

## Follow-ups (separate tickets)

- Headless-UI-blind issue (report 3): explicitly out of scope per task.
- Consider removing `SUPERSET_AGENT_HOOK_PORT` injection or setting it from the CLI for consistency.
- Suggestion 4: surface one-shot "agent status unavailable" UI on repeated hook connection failures (needs a reporting channel; moot for the frozen-port case after this fix).

## Repro transcript

(filled in below by the repro run)
