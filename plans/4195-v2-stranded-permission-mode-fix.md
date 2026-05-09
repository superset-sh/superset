# 4195 — v2 launches Claude with stale `--permission-mode acceptEdits`

## Root cause

There are two parallel agent-command stores with no sync between them:

| | V1 store | V2 store |
|---|---|---|
| Backing | desktop main `settings.agentPresetOverrides` (file-backed) | host-service SQLite `host_agent_configs` |
| Edits | `V1AgentsSettings` | `V2AgentsSettings` |
| Read by | v1 launch paths | `useV2AgentConfigs` → `useV2PresetExecution` |

`runAgentPresetPermissionsMigration` (`apps/desktop/src/lib/trpc/routers/settings/index.ts:135-165`) restores YOLO defaults (`claude --dangerously-skip-permissions`) for pre-#3546 users — but writes ONLY to `settings.agentPresetOverrides` (v1). The host-service `host_agent_configs` table is freshly seeded with `claude` + `["--permission-mode","acceptEdits"]` from `getDefaultSeedPresets()` and never receives the v1 override.

`useV2PresetExecution.ts` overlays the live host-service config on top of the v2 row's snapshot. Live wins. So v2 launches always run `acceptEdits`, silently overriding the user's `--dangerously-skip-permissions` preference.

Three additional sub-bugs identified:

1. **Renamed v1 preset on import.** `ImportPresetsPage.tsx` only sets `linkedAgentId` when `preset.name` is in `AGENT_TYPES`. A user-renamed v1 Claude preset (e.g. "Yolo Claude") imports with `agentId: undefined`, so the overlay short-circuits and the launch is the snapshot forever.
2. **Stale snapshot on import.** Even with `agentId` set, `commands` is copied verbatim from v1. If the user customized the v1 terminal-preset commands (not the agent-preset overrides), the v2 row carries those forever and only the live overlay can correct it — which loops back to the host-service-store-was-never-migrated problem.
3. **Empty `useV2AgentConfigs` at execute time.** `staleTime: Infinity` + `enabled: !!hostUrl`. If `activeHostUrl` is null at the moment of `executePreset`, `agents` is `[]`, every preset with `agentId` falls through to its stale `preset.commands` snapshot.

## Fix

### Primary: mirror v1 envelope into the v2 host-service store

A renderer-driven mirror, fired once per `activeHostUrl` per session.

**Host-service: idempotent migration mutation.**
`mirrorLegacyOverrides` (`packages/host-service/src/trpc/router/settings/agent-configs.ts`) takes `{ presetId, command, args }[]` and writes to a row only if its `command + args` still match the bundled seed default exactly. Idempotent by design — no marker column needed: the second invocation no longer matches the seed default, so it's a no-op. Critically, this means a user who has already customized a row in `V2AgentsSettings` is never clobbered, and the migration can run on every connect with zero risk.

**Desktop main: build the mirror plan.**
`buildLegacyHostAgentMirrorPlan` (`apps/desktop/src/lib/trpc/routers/settings/v2-host-agent-mirror.ts`) reads the v1 `agentPresetOverrides` envelope and translates each legacy override `command` string (like `"claude --dangerously-skip-permissions"`) into split `{ command, args }` form using `shell-quote`. Exposed as the tRPC query `settings.getV2HostAgentMirrorPlan`.

**Renderer hook.**
`useV2HostAgentMirror` (`apps/desktop/src/renderer/hooks/useV2HostAgentMirror`) fires the mirror once per `hostUrl` (per renderer session, deduped via a ref) when both the plan and `hostUrl` are known. On success, invalidates `V2_AGENT_CONFIGS_QUERY_KEY` so the v2 settings page and `useV2PresetExecution` see the new commands immediately.

Wired into `LocalHostServiceProvider` so the mirror runs as soon as the local host-service is reachable.

Why renderer-driven, not main-driven: keeping the migration in renderer-trpc-land means the desktop main process doesn't take a new dependency on the host-service tRPC client, and the host-service stays stateless about who its caller is. The mirror is a one-shot per session — if it fails, the user can restart the app or any v2-side edit invalidates the seed-default-match check anyway, so fancier retry logic is unnecessary.

### Sub-bug fixes

**Renamed v1 preset.** `inferImportedAgentId` in `ImportPresetsPage.tsx` now matches first by `name` (preserving existing behavior) and falls back to the basename of the first command's executable. So a renamed `"Yolo Claude"` preset whose first command is `"claude --dangerously-skip-permissions"` correctly links to `agentId: "claude"` on import.

**Overlay fallback in `useV2PresetExecution`.** When a preset's `agentId` is unset, the resolver now also tries to match the snapshot's first-command basename against `presetIdByCommandBasename` (built from `agents`). If a known builtin matches, the live overlay wins — so legacy v1-imported rows with no `agentId` still pick up the user's current v2 settings. If `agentId` is set but the lookup misses, we log a `console.warn` rather than silently snapshotting.

**Empty configs at execute.** `executePreset` in `useV2PresetExecution` now blocks when `!activeHostUrl` or when the configs query is still pending/loading, surfacing a toast instead of silently launching from the snapshot. By the time the user sees the v2 UI, `LocalHostServiceProvider` has already established the host URL — this guard catches the genuinely-not-yet-ready case.

### v1 surgery avoided

Per the user's preference to fix forward in v2 and not evolve v1 code, all changes are in v2 paths or in shared/v1-immutable boundaries. The v1 `runAgentPresetPermissionsMigration` and `applyLegacyPermissionsOverrides` are reused untouched.

## Tests

- `packages/host-service/src/trpc/router/settings/agent-configs.test.ts` — six new cases for `mirrorLegacyOverrides`:
  - rewrites a seed-default row when the v1 override differs (the core regression);
  - is idempotent on second call;
  - does not clobber a v2-side customization (skips with `user-customized`);
  - seeds defaults if the table was empty;
  - skips presetIds that are not installed;
  - skips with `no-op` when the override matches the current row exactly.
- `apps/desktop/src/lib/trpc/routers/settings/v2-host-agent-mirror.test.ts` — six cases for the v1-envelope → mirror-plan translation:
  - empty envelope → empty plan;
  - end-to-end: feed `applyLegacyPermissionsOverrides` output through `buildLegacyHostAgentMirrorPlan` and verify `claude` becomes `{ command: "claude", args: ["--dangerously-skip-permissions"] }` (this is the regression test the user called out);
  - includes codex / gemini / copilot;
  - preserves user-customized v1 overrides;
  - skips agents whose override has only `promptCommandSuffix`;
  - ignores overrides for non-builtin agent IDs.
- `apps/desktop/src/renderer/routes/_authenticated/components/V1ImportModal/ImportPresetsPage/ImportPresetsPage.test.ts` — six cases for `inferImportedAgentId`:
  - matches by name when name is a builtin agent ID;
  - matches a renamed preset with the pre-#3546 yolo command;
  - matches a renamed preset with the current default command;
  - matches when the command includes a leading directory path;
  - returns undefined when neither name nor basename match;
  - returns undefined for empty commands.

The end-to-end regression chain (pre-#3546 user → v1 envelope override → v2 launch with `--dangerously-skip-permissions`) is covered by chaining `applyLegacyPermissionsOverrides` → `buildLegacyHostAgentMirrorPlan` → `mirrorLegacyOverrides`. Each link is unit-tested.

## Files touched

Added:
- `apps/desktop/src/shared/argv.ts` — moved from `renderer/lib/argv.ts` so main can use `parseCommandString` too.
- `apps/desktop/src/lib/trpc/routers/settings/v2-host-agent-mirror.ts` + `.test.ts`.
- `apps/desktop/src/renderer/hooks/useV2HostAgentMirror/{useV2HostAgentMirror.ts,index.ts}`.
- `apps/desktop/src/renderer/routes/_authenticated/components/V1ImportModal/ImportPresetsPage/ImportPresetsPage.test.ts`.

Modified:
- `apps/desktop/src/renderer/lib/argv.ts` → re-exports from `shared/argv`.
- `apps/desktop/src/lib/trpc/routers/settings/index.ts` → added `getV2HostAgentMirrorPlan` query.
- `apps/desktop/src/renderer/routes/_authenticated/components/V1ImportModal/ImportPresetsPage/ImportPresetsPage.tsx` → exported `inferImportedAgentId`, used for `linkedAgentId`.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2PresetExecution/useV2PresetExecution.ts` → command-basename overlay fallback + execute-time host/configs guard.
- `apps/desktop/src/renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider.tsx` → invokes `useV2HostAgentMirror`.
- `packages/host-service/src/trpc/router/settings/agent-configs.ts` → new `mirrorLegacyOverrides` mutation + tests.

## Known limitations / follow-ups

- The mirror only translates the v1 `command` field into the v2 launch shape. v1's `promptCommand` and `promptCommandSuffix` (codex's trailing `--`, copilot's `-i`, etc.) don't have a clean 1:1 mapping into the v2 split `{ command, args, promptArgs }` shape — for now they remain v2-default. This matches the reported regression scope; the prompt-side variants can be addressed separately if reports come in.
- The renderer-driven mirror runs after `LocalHostServiceProvider` has the host URL, which is "good enough" since the v2 UI doesn't render before then. A theoretical race exists where a launch fires in the same tick the host URL resolves; the new `executePreset` host/loading guard catches it.
