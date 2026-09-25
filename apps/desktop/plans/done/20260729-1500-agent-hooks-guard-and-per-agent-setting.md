# Scope Superset agent hooks: env guard for unguarded agents + per-agent hooks setting

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template. Background investigation: `HOOKS_INVESTIGATION.md` at the repo root (written 2026-07-29; summarizes the leak report from a Factory Droid user).

## Purpose / Big Picture

Superset registers lifecycle hooks in the global config files of every supported CLI agent (Claude Code, Codex, Factory Droid, Cursor, and others) so it can show agent status and send notifications for sessions running inside Superset. Because those config files are user-global, the hooks also execute in agent sessions that have nothing to do with Superset — a user running Factory Droid in a plain terminal sees `SUPERSET_AGENT_ID=droid '/Users/<user>/.superset/hooks/notify.sh'` executing on every message, and the hook actually sends an HTTP request to a localhost port.

After this change:

1. Every registered hook command is inert outside Superset-managed terminals. It tests an environment variable that only Superset terminals set (`SUPERSET_HOME_DIR`) and exits immediately when absent, without executing `notify.sh` or making any network request. Today three agents (Droid, Codex, Mastra) and three hook-script templates (Cursor, Gemini, Copilot) lack this guard.
2. Users get a per-agent "Superset hooks" toggle in Settings → Agents. Turning it off removes Superset's managed entries from that agent's global config file and keeps them out across app restarts, so users who never use (say) Droid inside Superset can make Superset stop touching `~/.factory/settings.json` entirely.

Observable outcome: with the toggle off for Droid, `~/.factory/settings.json` contains no Superset entries even after restarting the Superset desktop app, and a Droid session shows no Superset hook lines at all. With the toggle on, running Droid in a non-Superset terminal shows a hook entry that exits instantly as a no-op and writes nothing to `/tmp` and sends no HTTP request.

Explicitly out of scope (recorded for posterity, see Decision Log): project-scoped hook registration inside Superset worktrees (only Droid and Claude support project-level config, so it cannot become the uniform pattern and is a larger lift), registration tied to app lifecycle (add on launch / remove on quit), and the upstream feature request to Factory for quieter hook rendering. This is a non-critical ask; we ship the cheap, uniform fixes now.

## Assumptions

- Factory Droid, Codex, and Mastra execute hook `command` strings through a shell (they already run env-prefixed commands like `SUPERSET_AGENT_ID=droid '<path>'`, which requires a shell), so the guarded command's `[ -n "$VAR" ] && … || true` form works. Verify per agent during Milestone 1 validation.
- The `settings` table in `packages/local-db` is the right home for a desktop-local preference (it already stores `defaultEditor`, `worktreeBaseDir`, etc.), and adding a nullable column is a routine local-db migration.
- No agent re-reads its global config mid-session in a way that makes teardown disruptive; config edits take effect on the next agent session. (Droid snapshots hooks at session start and flags external modification for review, which is another reason teardown should happen at toggle time and app startup, not continuously.)

## Open Questions

- Does the Droid UI still render a transcript line for a hook that exits via the guard in a few milliseconds? Expected yes (it renders all registered hooks) — the guard fixes side effects, the setting fixes rendering. Affects: how we word the toggle description. → Decision Log placeholder D6.
- Should the Add-agent flow in Settings automatically clear a previously disabled toggle? Plan says yes (adding an agent implies wanting its integration). → Decision Log D5.

## Progress

- [x] (2026-07-29) Milestone 1: migrated Droid, Codex, Mastra to the guarded hook command; shared `DYNAMIC_NOTIFY_PATH_MARKER` added to every affected managed-command predicate so re-merges do not duplicate entries.
- [x] (2026-07-29) Milestone 1: added Superset-env bail-outs to `cursor-hook.template.sh` (after the permission auto-approve print), `gemini-hook.template.sh`, `copilot-hook.template.sh`, and the defense-in-depth gate to `notify-hook.template.sh`; bumped markers (notify v6, cursor v5, gemini v4, copilot v3).
- [x] (2026-07-29) Milestone 1: unit tests updated and passing (88 pass in agent-setup, includes new foreign-session silent-exit test and cursor approve-before-bail-out ordering test). Remaining: manual foreign-terminal check with a real Droid session.
- [x] (2026-07-29) Milestone 2: `disabledAgentHooks` JSON column added; migration `packages/local-db/drizzle/0045_add_disabled_agent_hooks_setting.sql` generated via drizzle-kit.
- [x] (2026-07-29) Milestone 2: `remove*ManagedHooks()` per config writer (claude, codex, droid, mastra, cursor, gemini, kimi, grok, vibe) plus signature-gated file removal for amp/pi; `teardownActions` registry, `teardownSingleAgent`, and disabled-aware `setupDesktopAgentCapabilities` wired; startup call in `apps/desktop/src/main/index.ts` reads the disabled list from local-db.
- [x] (2026-07-29) Milestone 2: `getAgentHooksDisabled` / `setAgentHooksEnabled` tRPC procedures added; `setupAgent` clears the disabled flag before setup.
- [x] (2026-07-29) Milestone 2: "Superset hooks" switch added to `AgentDetail` (preset agents only, gated on `AGENT_TYPES` membership).
- [ ] Milestone 2: manual validation (toggle round-trip survives restart; user-defined hooks preserved byte-for-byte) — run in a dev app session.
- [x] (2026-07-29) Closeout: `bun run lint` exit 0, desktop + local-db typecheck clean, agent-setup tests green. Move plan to `done/` when the PR is created.

## Surprises & Discoveries

- (from investigation, 2026-07-29) The guarded command form already exists (`getManagedNotifyHookCommand` in `agent-wrappers-common.ts`) and is used by Claude, Grok, Kimi, and Vibe. Droid predates it (#2135 vs. guard introduced in #2621, generalized in #5552) and was never migrated; Codex's unguarded path was described as an intentional fallback but the guard preserves the case it was protecting (Superset terminals without the PATH wrapper still have `SUPERSET_HOME_DIR`).
- (from investigation) `notify-hook.template.sh`'s v1 fallback guard is defeated by agent-supplied data: it proceeds if `SESSION_ID` is non-empty, but `SESSION_ID` is parsed from the agent's own hook payload, which foreign sessions always provide. So unguarded foreign sessions really do curl `127.0.0.1:<port>/hook/complete`.
- (implementation, 2026-07-29) Copilot's registration is already session-scoped: the wrapper injects a per-project `.github/hooks/superset-notify.json` only when `SUPERSET_TERMINAL_ID` is set. The injected file persists in the worktree though, so the copilot template still got the bail-out. Amp and Pi plugins were already env-gated internally (`SUPERSET_TERMINAL_ID` checks in their templates); they still received teardown actions so the toggle removes their files entirely.
- (implementation, 2026-07-29) The `SUPERSET_HOME_DIR` guard is safe for v1 terminals: the Electron main process exports it into its own env at startup (`apps/desktop/src/main/lib/app-environment.ts`), and `apps/desktop/src/main/lib/terminal/env.test.ts` ("should preserve SUPERSET_HOME_DIR for app-launched hooks") pins v1 terminal inheritance.
- (implementation, 2026-07-29) Mastra's old command ran the notify script via `bash '<path>'`; the guarded command executes it directly like every other agent (the script is written 0o755), so the `bash` indirection was dropped rather than preserved.

## Decision Log

- Decision (D1): Fix scope is "guard + setting" only; project-scoped registration, lifecycle-tied registration, and the Factory upstream ask are deferred.
  Rationale: Not a critical issue; project scoping is only supported by 2 of ~12 agents so it would be a permanent special case, and lifecycle-tying only shrinks the window while risking Droid's mid-session config-modification review prompts. The guard makes leaked hooks inert everywhere; the setting gives affected users a complete opt-out.
  Date/Author: 2026-07-29 / Satya + agent investigation session.
- Decision (D2): Guarded command is the existing `getManagedNotifyHookCommand(agentId)` — no new mechanism.
  Rationale: Already proven in production for Claude/Grok/Kimi/Vibe; `SUPERSET_HOME_DIR` is injected only by Superset-managed terminal environments (`packages/host-service/src/terminal/env.ts`).
  Date/Author: 2026-07-29 / session.
- Decision (D3): The setting stores a disabled-list (`disabledAgentHooks`), not an enabled-list.
  Rationale: Default behavior (all agents registered) must not change for existing users; a null/empty column means "no change".
  Date/Author: 2026-07-29 / session.
- Decision (D4): On startup, disabled agents get active teardown (managed entries removed), not merely skipped setup.
  Rationale: Makes the toggle durable against entries written by older app versions, toggles made while the app was closed, and any future regression that re-adds entries.
  Date/Author: 2026-07-29 / session.
- Decision (D5, pending validation): `settings.setupAgent` (the Add-agent flow safety net) removes the agent from `disabledAgentHooks` before running setup.
  Rationale: Explicitly adding an agent in the UI expresses intent to integrate it; leaving it disabled would make the Add flow silently do nothing.
  Date/Author: 2026-07-29 / session.
- (D6 placeholder) Droid rendering of guarded no-op hooks — confirm during manual Milestone 1 validation and record here.

Revision note (2026-07-29): Implementation completed for both milestones in one pass on branch `investigate/hooks-outside-superset`. All automated validation is green; the two remaining unchecked items are manual dev-app checks (foreign-terminal Droid session, toggle round-trip) that need a running desktop build.

## Outcomes & Retrospective

Both milestones shipped in a single pass (2026-07-29). Every hook command Superset registers in an agent's global config is now guarded on `SUPERSET_HOME_DIR`, the per-agent hook scripts and `notify.sh` bail out without Superset-supplied env vars, and users can disable an agent's hook integration entirely from Settings → Agents (removal is immediate and re-enforced on every startup). Against the original purpose: the reported leak — a raw `SUPERSET_AGENT_ID=droid '/Users/…/notify.sh'` command firing and curling localhost from foreign Droid sessions — is eliminated in both layers (registration content and script behavior), and the opt-out exists for users who want zero Superset presence in a tool's config.

Automated validation: desktop + local-db typecheck clean, root lint exit 0, 88 agent-setup tests pass (bun 1.3.14, matching CI). Outstanding manual checks, to be done on a dev build alongside PR review: foreign-terminal Droid session shows no side effects (and record whether Droid still renders a transcript line for the guarded no-op — Decision D6), and the toggle round-trip preserves a seeded user hook byte-for-byte across restart.

Lessons: the duplicate-entry trap (guarded commands not matching their own managed-command predicates) was the one non-obvious hazard, and it existed in three modules; hoisting the marker into `agent-wrappers-common.ts` closes the class. Copilot/Amp/Pi turned out to already be env-gated internally — the audit step in this plan was worth it to avoid redundant changes there.

## Context and Orientation

Affected app: `apps/desktop` only (Electron main process, its tRPC router, and the renderer settings screen). Affected package: `packages/local-db` (the desktop's local SQLite schema, managed with Drizzle ORM — a type-safe database toolkit; "migration" means a generated SQL file that alters the local database schema).

Key concepts, defined:

- "Agent" here means a third-party CLI coding tool Superset integrates with: Claude Code (`claude`), OpenAI Codex (`codex`), Factory Droid (`droid`), Cursor (`cursor-agent`), Gemini, Mastra (`mastracode`), Kimi, Grok, Copilot, Vibe, Amp, Pi, OpenCode. The canonical list is `DESKTOP_AGENT_SETUP_TARGETS` in `apps/desktop/src/main/lib/agent-setup/desktop-agent-capabilities.ts`, each entry pairing an agent id with its `setupActions`.
- "Hooks" are shell commands those tools run at lifecycle events (session start/stop, prompt submit, tool use). Each tool reads them from a user-global config file in the home directory. Superset's setup code merges its own entries into those files at every desktop app startup: `setupAgentHooks()` (`apps/desktop/src/main/lib/agent-setup/index.ts`) is called from `apps/desktop/src/main/index.ts` (currently line 429) and runs `setupDesktopAgentCapabilities()` (`apps/desktop/src/main/lib/agent-setup/desktop-agent-setup.ts`), which executes every agent's setup actions unconditionally.
- The hook entries all invoke one shared script, `~/.superset/hooks/notify.sh`, written from the template `apps/desktop/src/main/lib/agent-setup/templates/notify-hook.template.sh` by `createNotifyScript()` (`apps/desktop/src/main/lib/agent-setup/notify-hook.ts`). The script parses the agent's JSON payload and POSTs a lifecycle event to Superset (v2 host-service URL from `SUPERSET_HOST_AGENT_HOOK_URL`, falling back to the v1 Electron localhost server).
- "Guarded command" means the shell one-liner produced by `getManagedNotifyHookCommand(agentId)` in `apps/desktop/src/main/lib/agent-setup/agent-wrappers-common.ts`:

        [ -n "$SUPERSET_HOME_DIR" ] && [ -x "$SUPERSET_HOME_DIR/hooks/notify.sh" ] && SUPERSET_AGENT_ID=<id> "$SUPERSET_HOME_DIR/hooks/notify.sh" || true

  `SUPERSET_HOME_DIR` is exported only into terminals Superset spawns (see `packages/host-service/src/terminal/env.ts`, and the wrapper/shell setup under `apps/desktop/src/main/lib/agent-setup/shell-wrappers.ts`), so outside Superset the command short-circuits to `true`.

Current per-agent state of the global config writers (all under `apps/desktop/src/main/lib/agent-setup/`):

- Guarded already: Claude (`agent-wrappers-claude-codex-opencode.ts`, `~/.claude/settings.json`), Grok (`agent-wrappers-grok.ts`, `~/.grok/`), Kimi (`agent-wrappers-kimi.ts`, `~/.kimi-code/config.toml`), Vibe (`agent-wrappers-vibe.ts`, `~/.vibe/hooks.toml`).
- Unguarded absolute-path commands (Milestone 1 targets): Droid (`agent-wrappers-droid.ts` line ~128, `~/.factory/settings.json`), Codex (`agent-wrappers-claude-codex-opencode.ts` line ~401, `~/.codex/hooks.json`), Mastra (`agent-wrappers-mastra.ts` line ~71, `~/.mastracode/hooks.json`).
- Unguarded dedicated hook scripts registered globally (Milestone 1 targets): Cursor (`~/.cursor/hooks.json` → `~/.superset/hooks/cursor-hook.sh` from `templates/cursor-hook.template.sh`), Gemini (`~/.gemini/settings.json` → gemini hook script from `templates/gemini-hook.template.sh`), Copilot (`templates/copilot-hook.template.sh`).
- Not leaking (no action): OpenCode (plugin lives in a Superset-owned dir selected via `OPENCODE_CONFIG_DIR`), Amp/Pi (plugin/extension files — confirm during implementation that their execution is Superset-gated; if not, apply the same bail-out pattern and note it in Surprises & Discoveries).

Duplicate-prevention machinery, which Milestone 1 must extend: each config writer removes previously written Superset entries before appending the current desired entries, identifying them via an `isManaged…Command` predicate. Those predicates currently match the absolute notify path and the `/.superset*/hooks/notify.sh` path pattern (`isSupersetManagedHookCommand` in `agent-wrappers-common.ts`). The guarded command contains neither — it references `$SUPERSET_HOME_DIR/hooks/notify.sh` literally. Claude already solved this with `CLAUDE_DYNAMIC_NOTIFY_PATH_MARKER` (the literal string `$SUPERSET_HOME_DIR/hooks/notify.sh`) in its predicate. Droid/Codex/Mastra predicates must gain the same check or every app restart would append a duplicate guarded entry.

The settings infrastructure Milestone 2 builds on: the desktop's local SQLite schema lives in `packages/local-db/src/schema/schema.ts` (single-row `settings` table, id 1, columns like `defaultEditor`); the desktop settings tRPC router is `apps/desktop/src/lib/trpc/routers/settings/index.ts` (see `getDefaultEditor`/`setDefaultEditor` for the read/write pattern and `setupAgent` at line ~1081 for the existing per-agent setup mutation calling `setupSingleAgent`); the renderer settings screen is `apps/desktop/src/renderer/routes/_authenticated/settings/agents/components/V2AgentsSettings/V2AgentsSettings.tsx`, which already calls `electronTrpc.settings.setupAgent`. Per desktop AGENTS.md, all renderer↔main communication goes through this tRPC layer (`electronTrpc`).

## Plan of Work

### Milestone 1: guard every registered hook command

Migrate the three unguarded notify-command writers to the guarded command. In `agent-wrappers-droid.ts`, replace the `managedHookCommand` construction (`SUPERSET_AGENT_ID=droid ${quoteShellPath(notifyScriptPath)}`) with `getManagedNotifyHookCommand("droid")`, and extend `isManagedHookCommand` to also match the literal `$SUPERSET_HOME_DIR/hooks/notify.sh` substring (mirror Claude's `CLAUDE_DYNAMIC_NOTIFY_PATH_MARKER`; hoist that constant into `agent-wrappers-common.ts` as a shared `DYNAMIC_NOTIFY_PATH_MARKER` rather than duplicating the string — AGENTS.md discourages copy-paste divergence). Do the same for Codex (`codexCommand` in `agent-wrappers-claude-codex-opencode.ts`; note its merge currently only removes-then-pushes for stale entries — route it through the same predicate extension so guarded entries are recognized on re-merge) and Mastra (`agent-wrappers-mastra.ts`; keep its `bash` invocation semantics inside the guarded form only if Mastra requires it — check why `bash` is there; if the guarded form works as-is, standardize on it). Because the written JSON content changes, `writeFileIfChanged` rewrites the files on next startup and the extended predicates reap the old unguarded entries — no separate migration step is needed.

Add bail-outs to the three dedicated hook-script templates. At the top of `templates/cursor-hook.template.sh`, `templates/gemini-hook.template.sh`, and `templates/copilot-hook.template.sh`, immediately after the marker line, insert an exit-early stanza. For Cursor keep the permission-response contract intact: the script must still print `{"continue":true}` before exiting when the event is `PermissionRequest`, even outside Superset, so a foreign cursor-agent session is never left blocked — place the bail-out after the auto-approve print, or replicate the print inside it. For Gemini and Copilot a plain top-of-file bail-out suffices:

    [ -n "$SUPERSET_HOME_DIR" ] || [ -n "$SUPERSET_TERMINAL_ID" ] || [ -n "$SUPERSET_TAB_ID" ] || exit 0

Add the same stanza to `templates/notify-hook.template.sh` right after input parsing begins (before any curl), as defense-in-depth for stale configs written by older app versions that still reference the absolute path. This intentionally changes the v1-fallback semantics at the current line ~118: today a payload-supplied `session_id` alone lets the script proceed; after this change a Superset-supplied variable is required. All Superset-launched agent processes inherit these variables from their terminal environment, so no legitimate path is lost. Bump `NOTIFY_SCRIPT_MARKER` in `notify-hook.ts` from `v5` to `v6`, and bump the equivalent markers for the cursor/gemini/copilot scripts so the changed content is written (find each marker constant next to its `create…HookScript` function).

Update the existing tests in `agent-wrappers.test.ts` and `notify-hook.test.ts`: assertions that expect the old unguarded command strings change to the guarded form; add cases proving that (a) a config containing the guarded entry is not duplicated by a second merge, and (b) a config containing the old absolute-path entry is reaped and replaced.

### Milestone 2: per-agent hooks setting

Schema: add `disabledAgentHooks: text("disabled_agent_hooks", { mode: "json" }).$type<string[]>()` to the `settings` table in `packages/local-db/src/schema/schema.ts`, then generate the migration with `bun run generate` inside `packages/local-db` (drizzle-kit; never hand-edit files under `packages/local-db/drizzle/`). A null or empty value means all agents enabled — existing installs see no behavior change.

Teardown support: in each global-config-writing module, add a removal function alongside the existing creator — e.g. `removeDroidManagedHooks()` in `agent-wrappers-droid.ts` — that reads the existing file, strips entries matching the (now extended) managed predicate, deletes hook event keys left empty, and writes back via `writeFileIfChanged` (skip the write entirely when the file does not exist; never create a config file just to prove absence). The filtering logic is the same code path the creators already use for reaping — factor it so creator and remover share it rather than duplicating. In `desktop-agent-capabilities.ts`, extend each target entry with `teardownActions` listing the removal runners for its config-file writes only (wrappers and scripts under `~/.superset/` are Superset-owned and harmless; they stay). In `desktop-agent-setup.ts`, add `teardownSingleAgent(agentId)` mirroring `setupSingleAgent`, and change `setupDesktopAgentCapabilities()` to accept the disabled list and run setup or teardown per target accordingly. The startup call site in `apps/desktop/src/main/index.ts` reads the disabled list from local-db before calling it.

tRPC + UI: in `apps/desktop/src/lib/trpc/routers/settings/index.ts`, add `getAgentHooksDisabled` (query returning the list) and `setAgentHooksEnabled` (mutation with `{ agentId, enabled }`) following the `defaultEditor` upsert pattern; the mutation persists the list, then immediately runs `setupSingleAgent` or `teardownSingleAgent` so the effect is instant, not restart-gated. Update the existing `setupAgent` mutation to first remove the agent id from `disabledAgentHooks` (Decision D5). In `V2AgentsSettings.tsx`, render a switch per agent row labeled "Superset hooks" with description copy that states the trade plainly: disabling removes Superset's entries from the agent's global config so nothing Superset-related appears in any session of that tool, and also disables status icons and notifications for that agent inside Superset. Follow the component-structure conventions in AGENTS.md (co-locate any new subcomponent under `V2AgentsSettings/components/`).

## Concrete Steps

Work from the repo root on a feature branch. After each milestone:

    bun run typecheck
    # Expected: exit 0, no errors

    bun run lint:fix && bun run lint
    # Expected: second command exits 0 with no output (CI fails on warnings)

    bun test apps/desktop/src/main/lib/agent-setup
    # Expected: all agent-setup tests pass, including the new merge/reap/teardown cases

For the local-db migration:

    cd packages/local-db && bun run generate
    # Expected: one new SQL file under packages/local-db/drizzle/ adding the
    # disabled_agent_hooks column; do not edit generated files

## Validation and Acceptance

Milestone 1 (manual, macOS): launch the dev desktop app (`bun dev`) so setup runs, then inspect `~/.factory/settings.json` — every Superset entry's `command` must start with `[ -n "$SUPERSET_HOME_DIR" ]` and contain no absolute `/Users/...` notify path. Restart the app and confirm the file is byte-identical (no duplicate entries). In a plain (non-Superset) terminal run `droid`, send a message, and confirm: any rendered hook line reports an immediate exit, `/tmp/superset-agent-hooks.log` gains no lines, and `lsof`/proxy shows no request to the Superset notification port. Inside a Superset workspace terminal run `droid` and confirm the agent status icon and stop notification still work end-to-end. Repeat the inside-Superset check for `codex` and `cursor-agent` (cursor must still auto-approve permission prompts outside Superset — verify a foreign cursor session is not left hanging on a permission request).

Milestone 2: in Settings → Agents, toggle Droid's "Superset hooks" off; `~/.factory/settings.json` immediately loses all Superset entries while user-defined hooks in the same file survive byte-for-byte. Restart the app; the entries stay gone. Toggle on; entries return in guarded form. Seed a fake user hook in the file before testing to prove preservation. Confirm `settings.setupAgent` (Add-agent flow) re-enables a disabled agent.

## Idempotence and Recovery

All config writes go through the existing merge/reconcile + `writeFileIfChanged` machinery, so every step is safely re-runnable; a second run is a no-op. Teardown on a file with no managed entries is a no-op and never creates files. If a merge encounters unparseable JSON it already skips with a warning (existing behavior — keep it). Rollback for Milestone 1 is reverting the commit; the old code's predicates still match and reap guarded entries via the notify-path pattern only partially, so if a revert is ever needed, also revert the marker bumps so scripts rewrite to the old content.

## Artifacts and Notes

The command string a foreign Droid session showed before this change (the bug report):

    Hooks Stop
    └── SUPERSET_AGENT_ID=droid '/Users/arnaud/.superset/hooks/notify.sh' : Exit code 0

The same entry after Milestone 1:

    [ -n "$SUPERSET_HOME_DIR" ] && [ -x "$SUPERSET_HOME_DIR/hooks/notify.sh" ] && SUPERSET_AGENT_ID=droid "$SUPERSET_HOME_DIR/hooks/notify.sh" || true

After Milestone 2 with Droid's toggle off, `~/.factory/settings.json` contains no Superset-managed entries at all.

## Interfaces and Dependencies

No new libraries. New/changed surface, all internal:

- `apps/desktop/src/main/lib/agent-setup/agent-wrappers-common.ts`: export `DYNAMIC_NOTIFY_PATH_MARKER` (the literal `$SUPERSET_HOME_DIR/hooks/notify.sh`).
- Per-module removal functions (`removeDroidManagedHooks`, `removeCodexManagedHooks`, `removeMastraManagedHooks`, `removeClaudeManagedHooks`, `removeCursorManagedHooks`, `removeGeminiManagedHooks`, `removeKimiManagedHooks`, `removeGrokManagedHooks`, `removeVibeManagedHooks`, `removeCopilotManagedHooks`, plus Amp/Pi if their audit shows global writes), registered as `teardownActions` in `desktop-agent-capabilities.ts`.
- `desktop-agent-setup.ts`: `teardownSingleAgent(agentId: string): boolean`; `setupDesktopAgentCapabilities({ disabledAgentIds }: { disabledAgentIds: string[] }): void`.
- tRPC (`settings` router): `getAgentHooksDisabled` → `string[]`; `setAgentHooksEnabled({ agentId: string, enabled: boolean })` → `{ success: boolean }`.
- `packages/local-db` settings table: nullable `disabled_agent_hooks` JSON text column typed `string[]`.
