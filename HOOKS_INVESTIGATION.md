# Investigation: Superset agent hooks firing in non-Superset terminals

> Remediation plan (implemented): `apps/desktop/plans/done/20260729-1500-agent-hooks-guard-and-per-agent-setting.md` (guard migration + per-agent hooks setting; project-scoped registration deliberately deferred).

**Reported symptom:** Arnaud ran Factory Droid in a plain terminal (outside Superset) and Droid's UI showed a Superset hook executing on every lifecycle event:

```
Hooks Stop
└── SUPERSET_AGENT_ID=droid '/Users/arnaud/.superset/hooks/notify.sh' : Exit code 0
```

## TL;DR / Root cause

Superset **deliberately registers its lifecycle hooks in each agent tool's global, user-level config** (e.g. `~/.factory/settings.json`, `~/.claude/settings.json`, `~/.codex/hooks.json`) at desktop-app startup. That means every session of that agent on the machine — Superset-launched or not — invokes the hook.

There *is* a scoping mechanism: newer agent integrations wrap the hook command in an env-var guard so it no-ops outside Superset terminals:

```sh
[ -n "$SUPERSET_HOME_DIR" ] && [ -x "$SUPERSET_HOME_DIR/hooks/notify.sh" ] && SUPERSET_AGENT_ID=<id> "$SUPERSET_HOME_DIR/hooks/notify.sh" || true
```

But **Droid, Codex, and Mastra were never migrated to the guarded command**. Their configs get a raw, unconditional absolute path:

```sh
SUPERSET_AGENT_ID=droid '/Users/<user>/.superset/hooks/notify.sh'
```

so `notify.sh` runs unconditionally in every Droid session on the machine. That is exactly the command string in Arnaud's screenshot.

Note the guard only silences the *side effects*; even guarded hooks are still globally registered, so tools that render hook execution in their UI (as Droid does) will still show a "Hooks" line — it just exits immediately via `|| true`.

## How hook installation works

### 1. Startup: unconditional global registration

`setupAgentHooks()` runs every time the desktop app boots (`apps/desktop/src/main/index.ts:429`), which calls `setupDesktopAgentCapabilities()` (`apps/desktop/src/main/lib/agent-setup/desktop-agent-setup.ts:73`). This:

- Writes the shared hook script to `~/.superset/hooks/notify.sh` (`notify-hook.ts` → `HOOKS_DIR` from `paths.ts`; `SUPERSET_HOME_DIR` = `~/.superset` in prod).
- Writes PATH-shim wrappers to `~/.superset/bin/<agent>` that export `SUPERSET_AGENT_ID` and exec the real binary (`agent-wrappers-common.ts:buildWrapperScript`). These only take effect inside Superset terminals (Superset prepends its bin dir to PATH), so the wrappers themselves are properly scoped.
- **Merges Superset hook definitions into each agent's global config file** — this is the part that escapes Superset:

| Agent | Global file written | Hook command style |
|---|---|---|
| Claude Code | `~/.claude/settings.json` | ✅ guarded (`getManagedNotifyHookCommand("claude")`) |
| Grok | `~/.grok/…` hooks | ✅ guarded |
| Kimi | `~/.kimi-code/config.toml` | ✅ guarded |
| Vibe | `~/.vibe/…` hooks | ✅ guarded |
| **Droid** | `~/.factory/settings.json` | ❌ **unguarded absolute path** |
| **Codex** | `~/.codex/hooks.json` | ❌ **unguarded absolute path** |
| **Mastra** | mastra hooks.json | ❌ **unguarded absolute path** (`SUPERSET_AGENT_ID=mastracode bash '<path>'`) |
| Cursor | `~/.cursor/hooks.json` | ❌ unguarded — points at `~/.superset/hooks/cursor-hook.sh` |
| Gemini / Copilot | global settings + hook script | ❌ unguarded hook-script path |
| OpenCode | env-scoped plugin dir only (`OPENCODE_CONFIG_DIR` exported by wrapper) | ✅ properly scoped — global plugin actively cleaned up |

### 2. The Droid registration (the reported case)

`apps/desktop/src/main/lib/agent-setup/agent-wrappers-droid.ts:117-193` (`getDroidSettingsJsonContent`):

```ts
export function getDroidSettingsJsonPath(): string {
  return path.join(os.homedir(), ".factory", "settings.json");   // GLOBAL
}
...
const managedHookCommand = `SUPERSET_AGENT_ID=droid ${quoteShellPath(notifyScriptPath)}`;
// → SUPERSET_AGENT_ID=droid '/Users/<user>/.superset/hooks/notify.sh'
```

It registers this command for `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `Notification`, `Stop`, and `PostToolUse` (matcher `*`). Factory Droid reads `~/.factory/settings.json` for **every** session, so every Droid run anywhere on the machine executes the hook — hence the `Hooks Stop … Exit code 0` line Arnaud saw.

### 3. Contrast: the guarded command exists, Droid just doesn't use it

`apps/desktop/src/main/lib/agent-setup/agent-wrappers-common.ts:20-22`:

```ts
export function getManagedNotifyHookCommand(agentId: string): string {
  return `[ -n "$SUPERSET_HOME_DIR" ] && [ -x "$SUPERSET_HOME_DIR/${MANAGED_NOTIFY_RELATIVE_PATH}" ] && SUPERSET_AGENT_ID=${agentId} "$SUPERSET_HOME_DIR/${MANAGED_NOTIFY_RELATIVE_PATH}" || true`;
}
```

`SUPERSET_HOME_DIR` is injected only into Superset-managed terminal environments (`packages/host-service/src/terminal/env.ts:249`, alongside `SUPERSET_TERMINAL_ID` and `SUPERSET_HOST_AGENT_HOOK_URL`), so this command is inert in foreign terminals.

History: the guard was introduced for Claude in #2621 ("harden Claude task hooks in prod") and extracted into the shared helper in #5552 (Vibe), then adopted by Kimi (#af356c3d2) and Grok (#5859). Droid's hook support landed earlier (#2135, reshaped in #4232) and was never migrated. Codex is unguarded **on purpose** per its docstring ("fallback notification path that works even when the binary wrapper is not in PATH — e.g. user runs codex from outside a Superset terminal"), which conflates "Superset terminal without the wrapper on PATH" with "any terminal on the machine".

### 4. What actually happens when the hook fires outside Superset

`apps/desktop/src/main/lib/agent-setup/templates/notify-hook.template.sh`:

1. v2 path (`SUPERSET_HOST_AGENT_HOOK_URL` + `SUPERSET_TERMINAL_ID`) — skipped outside Superset, both env vars unset.
2. v1 fallback: it exits early only if `SUPERSET_TAB_ID`, `SESSION_ID`, **and** `SUPERSET_TERMINAL_ID` are *all* empty (line 118). But `SESSION_ID` is parsed from the agent's own hook payload (`session_id`), which Droid/Claude/Codex always provide. So in a foreign session the guard passes and the script **curls the Electron notification server** at `http://127.0.0.1:$SUPERSET_PORT/hook/complete` with a foreign session id and empty pane/tab/terminal ids.
3. The Electron server (`apps/desktop/src/main/lib/notifications/server.ts:52`) emits an `AGENT_LIFECYCLE` event for it regardless. In practice the event resolves to no pane and is dropped by consumers, but if a running Superset desktop happens to correlate it (or future consumers get less defensive), foreign-agent activity could surface as spurious in-app state. If Superset isn't running the curl fails silently.
4. Either way the script exits 0 — but the invocation itself is visible in agent UIs (Droid renders every hook execution), it adds latency to every lifecycle event, and it leaks the fact that Superset instruments the machine.

So the impact today is mostly noise (visible hook execution + a stray localhost request), but it violates the expectation that Superset only instruments its own sessions, and it applies to **every** Droid/Codex/Mastra/Cursor/Gemini/Copilot session on the machine as long as the desktop app has run once. Nothing removes the entries on uninstall either.

## Why global registration at all?

Two documented reasons in the code:

- Agents launched inside a Superset terminal don't always go through the PATH wrapper (user's own PATH may resolve the real binary first), so per-binary wrapping isn't a reliable hook-injection point — hence "register natively in the tool's config" (`createClaudeSettingsJson` docstring, `createCodexHooksJson` docstring).
- Most of these tools (Claude, Droid, Codex, Cursor) only support **user-global** hook config, not per-directory/session config, so there's no native place to scope the registration. The intended scoping mechanism is therefore *runtime* (the `SUPERSET_HOME_DIR` guard), not *registration-time* — and three integrations are missing it.

## Recommended fixes

1. **Migrate Droid, Codex, and Mastra to `getManagedNotifyHookCommand(agentId)`** — one-line changes in `agent-wrappers-droid.ts:128`, `agent-wrappers-claude-codex-opencode.ts:401`, `agent-wrappers-mastra.ts:71`. The stale-hook reapers already match managed commands by path pattern (`isSupersetManagedHookCommand` and the `$SUPERSET_HOME_DIR` marker check used for Claude), so old unguarded entries get cleaned up on next merge — verify the droid `isManagedHookCommand` also matches the guarded form (it matches on `/hooks/notify.sh`, so yes). If Codex's outside-wrapper fallback matters, note it only ever worked for *Superset* terminals missing the wrapper — those terminals do have `SUPERSET_HOME_DIR`, so the guard preserves that case exactly.
2. **Same treatment for the hook-script agents (Cursor, Gemini, Copilot):** either wrap their registered commands in the same guard, or add a top-of-script bail-out (`[ -n "$SUPERSET_TERMINAL_ID" ] || exit 0`) to `cursor-hook.template.sh`, `gemini-hook.template.sh`, `copilot-hook.template.sh`.
3. **Defense in depth — gate inside `notify-hook.template.sh` itself:** exit 0 immediately unless a Superset-controlled env var is present (`SUPERSET_TERMINAL_ID` or `SUPERSET_HOST_AGENT_HOOK_URL` or `SUPERSET_TAB_ID`). Today's v1 fallback guard (line 118) is defeated by the agent-supplied `session_id`; requiring a *Superset*-supplied variable fixes that class of leak for every current and future integration, including stale configs from older app versions.
4. **Consider registering hooks lazily/scoped where the tool allows it** (project-level `.claude/settings.json` in Superset worktrees, `OPENCODE_CONFIG_DIR`-style env-scoped config) and **removing global entries on uninstall** — the merge/reap machinery (`reconcileManagedEntries`) already exists to support this.
5. Cosmetic but real: even with guards, tools that render hook executions will show a Superset entry in every session. Fully hiding it requires per-session registration (option 4); the guard at least makes it an instant no-op.

## Key files

- `apps/desktop/src/main/lib/agent-setup/agent-wrappers-droid.ts` — the reported leak (global `~/.factory/settings.json`, unguarded command)
- `apps/desktop/src/main/lib/agent-setup/agent-wrappers-common.ts` — guarded command helper + wrapper builder
- `apps/desktop/src/main/lib/agent-setup/agent-wrappers-claude-codex-opencode.ts` — Claude (guarded), Codex (unguarded), OpenCode (properly scoped)
- `apps/desktop/src/main/lib/agent-setup/templates/notify-hook.template.sh` — shared hook script; v1 fallback fires on foreign sessions
- `apps/desktop/src/main/lib/agent-setup/desktop-agent-setup.ts` + `apps/desktop/src/main/index.ts:429` — unconditional registration at app startup
- `packages/host-service/src/terminal/env.ts` — where `SUPERSET_HOME_DIR` / `SUPERSET_TERMINAL_ID` / `SUPERSET_HOST_AGENT_HOOK_URL` are injected into Superset terminals only
- `apps/desktop/src/main/lib/notifications/server.ts` — v1 Electron `/hook/complete` receiver
