# Design: Add Antigravity CLI (`agy`) as a Built-in Terminal Agent

- **Status:** Approved (sections 1–7 reviewed 2026-06-01)
- **Source issue:** [superset-sh/superset#4986](https://github.com/superset-sh/superset/issues/4986)
- **Scope:** Full first-class desktop integration (manifest + wrapper + setup registry + icon + tests). Notification hooks deferred.
- **Worktree:** `apps/desktop`

## Problem

Google's Antigravity CLI (`agy`) is a production-grade terminal agent (Gemini 3.x models, multi-step reasoning, parallel sub-agents, project-level `AGENTS.md` context) but it does not appear in Superset's built-in terminal agent list. Users can run `agy` as a generic CLI agent in any Superset terminal, but they lose:

- The branded "Antigravity" entry in the agent picker UI
- A preset template in Settings → Agents
- The Superset-managed binary at `~/.superset/bin/agy` (and the `SUPERSET_AGENT_ID=agy` identity env var that wires the agent to future hook integrations)
- A documented configuration path for first-class features

The fix is a 5-touchpoint integration matching the existing pattern for built-in terminal agents. Antigravity CLI is brand new (v1.0.4 released 2026-06-01) and has no documented hook system yet, so notification hook integration is explicitly deferred to a follow-up.

## Goals

1. Make `agy` a first-class, selectable built-in agent matching the UX of Claude/Codex/Amp/OpenCode.
2. Use the same 5-touchpoint pattern as every other built-in agent (manifest, wrapper, setup registry, icon, tests).
3. Set the stage for future hook integration by exporting `SUPERSET_AGENT_ID=agy` from the wrapper today.
4. Defer speculative code: do not invent a hook integration that does not yet have a documented format upstream.

## Non-goals

- Notification hook integration. Antigravity CLI v1.0.4 has no `settings.json`, plugin, or extension model. Adding hooks would require guessing at a format that may change.
- A custom icon. Reuse the existing `antigravity.svg` asset; the CLI and editor are the same product family.
- Fixing antigravity-cli#76 (the `agy -p` no-output bug in non-TTY mode). That's an upstream issue.
- A new agent picker component. The existing pickers consume `BUILTIN_TERMINAL_AGENTS` and `PRESET_ICONS` at render time and need no changes.

## Architecture

The integration follows the existing 5-touchpoint pattern. Every layer is auto-derived from the manifest except for the wrapper, setup runner, and icon registration.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ packages/shared/src/builtin-terminal-agents.ts (manifest row)               │
│   id: "agy", label: "Antigravity", command: "agy", promptCommand: "agy -p"  │
│                                                                             │
│   Auto-derives:                                                             │
│   - BUILTIN_TERMINAL_AGENT_TYPES, BUILTIN_AGENT_LABELS                      │
│   - HOST_AGENT_PRESETS (host-service install catalog)                       │
│   - DEFAULT_TERMINAL_PRESET_AGENT_TYPES                                     │
│   - ManagedBinary union (typechecks DESKTOP_AGENT_SETUP_TARGETS)            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ apps/desktop/src/main/lib/agent-setup/agent-wrappers-agy.ts (NEW)          │
│   createAgyWrapper() — emits ~/.superset/bin/agy via buildWrapperScript()  │
│   v3 pass-through template + export SUPERSET_AGENT_ID="agy"                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ apps/desktop/src/main/lib/agent-setup/desktop-agent-capabilities.ts         │
│   DESKTOP_AGENT_SETUP_ACTIONS += "agy-wrapper"                              │
│   DESKTOP_AGENT_SETUP_TARGETS += { id: "agy", setupActions: [...],         │
│                                     managedBinary: true }                   │
│   → SUPERSET_MANAGED_BINARIES auto-derives "agy"                            │
│     → shell-wrappers.ts forces user-facing "agy" → ~/.superset/bin/agy      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ packages/ui/src/assets/icons/preset-icons/                                  │
│   agy.svg, agy-dark.svg (copies of antigravity.svg)                         │
│   PRESET_ICONS += agy: { light, dark }                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Touchpoint 1 — Manifest entry

**File:** `packages/shared/src/builtin-terminal-agents.ts`

Add to `BUILTIN_TERMINAL_AGENTS` (alphabetical, between `amp` and `claude`):

```ts
createBuiltinTerminalAgent({
  id: "agy",
  label: "Antigravity",
  description: "Google's agentic development platform — multi-step reasoning, parallel sub-agents, and project context via AGENTS.md.",
  command: "agy",
  promptCommand: "agy -p",
  includeInDefaultTerminalPresets: true,
}),
```

**Field rationale:**

- `id: "agy"` — wire-level identity. Must match `SUPERSET_AGENT_ID` exactly. Type-checks against `BuiltinAgentId` via the `ManagedBinary` type alias.
- `label: "Antigravity"` — matches the product name. Used in pickers, terminal pane header, settings list.
- `description` — one-liner that names the three distinguishing features (multi-step reasoning, parallel sub-agents, AGENTS.md context).
- `command: "agy"` — default interactive launch. No `--dangerously-skip-permissions` by default; users opt in via Settings → Permissions.
- `promptCommand: "agy -p"` — headless print mode used by the task agent transport. Matches the issue's note that `agy` uses `-p`/`--print` for non-interactive mode. **Known issue:** antigravity-cli#76 documents that `agy -p` in non-TTY mode currently produces no output. We still register the command because that's the documented headless flag; the upstream fix is out of scope.
- `includeInDefaultTerminalPresets: true` — shows in Settings → Agents by default, matching the bar set by Claude/Codex/Amp/Copilot.

**Auto-derives** (no extra edits):
- `BUILTIN_TERMINAL_AGENT_TYPES` includes `"agy"`
- `BUILTIN_TERMINAL_AGENT_LABELS.agy === "Antigravity"`
- `BUILTIN_AGENT_LABELS.agy === "Antigravity"` (via `agent-catalog.ts:34-39`)
- `BUILTIN_AGENT_DEFINITIONS` includes the agy definition (`agent-catalog.ts:54-57`)
- `HOST_AGENT_PRESETS` (host-service install catalog) includes agy (`host-agent-presets.ts:41-55`)
- `DEFAULT_TERMINAL_PRESET_AGENT_TYPES` includes `"agy"`

## Touchpoint 2 — Wrapper script

**New file:** `apps/desktop/src/main/lib/agent-setup/agent-wrappers-agy.ts`

```ts
import path from "node:path";
import { BIN_DIR, WRITE_MODE } from "./paths";
import { buildWrapperScript, writeFileIfChanged } from "./agent-wrappers-common";

export const AGY_WRAPPER_MARKER = "# Superset agent-wrapper v3";

export function createAgyWrapper(): void {
  const wrapperPath = path.join(BIN_DIR, "agy");
  const execLine = 'exec "$REAL_BIN" "$@"';
  const content = buildWrapperScript({
    agentId: "agy",
    binaryName: "agy",
    execLine,
    extraEnv: {},
  });
  writeFileIfChanged(wrapperPath, content, WRITE_MODE.WRAPPER);
}
```

The generated wrapper at `~/.superset/bin/agy` is byte-identical (modulo path) to the wrappers for `claude`/`amp`/`droid`/`gemini`/`mastracode`/`opencode`:

```bash
#!/bin/bash
# Superset agent-wrapper v3
# Superset wrapper for agy
find_real_binary() { ... }   # standard v3 helper
REAL_BIN="$(find_real_binary "agy")"
if [ -z "$REAL_BIN" ]; then
  echo "Superset: agy not found in PATH. Install it and ensure it is on PATH, then retry." >&2
  exit 127
fi
export SUPERSET_AGENT_ID="agy"
exec "$REAL_BIN" "$@"
```

**Why this works for agy even without hooks:**

- `SUPERSET_AGENT_ID=agy` is exported into the agy process environment. Any future antigravity-cli hook system that reads the parent-process identity will see the correct value automatically.
- The wrapper is a **managed binary** (touchpoint 3), so `shell-wrappers.ts` routes the user's `agy` invocations through `~/.superset/bin/agy` even if shell config rewrites `$PATH`.
- The wrapper does not add `--dangerously-skip-permissions`. The manifest's `command` is the source of truth, and that default is `agy` (no flags).

**Re-export in barrel** (`apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts:1-84`):

```ts
export * from "./agent-wrappers-agy";
```

The existing `await import("./agent-wrappers")` at line 89 of the test file picks up the new export automatically.

**No template file** — `buildWrapperScript()` produces the v3 marker content from code. The `templates/` directory only holds heavyweight per-agent scripts (Codex wrapper, Copilot hook, Gemini hook) that genuinely need template files.

## Touchpoint 3 — Setup registry

**File A:** `apps/desktop/src/main/lib/agent-setup/desktop-agent-capabilities.ts`

1. Add `"agy-wrapper"` to `DESKTOP_AGENT_SETUP_ACTIONS` (alphabetical, between `"amp-wrapper"` and `"claude-settings-json"`):
   ```ts
   "agy-wrapper",
   "amp-wrapper",
   ```

2. Add `agy` target to `DESKTOP_AGENT_SETUP_TARGETS` (alphabetical, between `amp` and `claude`):
   ```ts
   {
     id: "agy",
     setupActions: ["agy-wrapper"],
     managedBinary: true,
   },
   ```

3. `SUPERSET_MANAGED_BINARIES` (lines 104-106) auto-derives from targets with `managedBinary: true` — no edit needed. This is what tells `shell-wrappers.ts` to force the user-facing `agy` to route through `~/.superset/bin/agy`.

**File B:** `apps/desktop/src/main/lib/agent-setup/desktop-agent-setup.ts:32-57`

Add the runner to the `DESKTOP_AGENT_SETUP_RUNNERS` map:
```ts
"agy-wrapper": createAgyWrapper,
```

**Bootstrap actions:** no change. `DESKTOP_AGENT_SETUP_BOOTSTRAP_ACTIONS` (lines 40-43) only runs `cleanup-global-opencode-plugin` and `notify-script`, neither of which is relevant for agy.

**`setupSingleAgent(agentId)` flow** (lines 76-86): when an existing user calls `setupAgent({ agentId: "agy" })` via tRPC (from Settings → Agents "set up" button), the runner walks through bootstrap actions then the `["agy-wrapper"]` list and writes the wrapper. `writeFileIfChanged` makes this a no-op when the file is already current.

## Touchpoint 4 — Icon

**Asset creation:** copy `apps/desktop/src/renderer/assets/app-icons/antigravity.svg` to two new files in the preset-icons directory:

- `packages/ui/src/assets/icons/preset-icons/agy.svg` (light variant)
- `packages/ui/src/assets/icons/preset-icons/agy-dark.svg` (dark variant — copy of the same file for now)

**Registration** in `packages/ui/src/assets/icons/preset-icons/index.ts:24-36`:

```ts
import agyIcon from "./agy.svg";
import agyDarkIcon from "./agy-dark.svg";

export const PRESET_ICONS: Record<string, PresetIconSet> = {
  // ...existing 11
  agy: { light: agyIcon, dark: agyDarkIcon },
};
```

**Why reuse the existing `antigravity.svg`:** the Antigravity CLI and Antigravity editor are the same product family with the same branding. The existing SVG is the only Antigravity icon asset in the repo. Reusing it is consistent with how the codebase already represents Antigravity. If the team later wants distinct icons, the light/dark pair can be replaced without code changes.

**No fallback risk:** `getPresetIcon()` in `index.ts:38-46` already does `.toLowerCase().trim()` and returns `undefined` for unknown names; the pickers show a generic `TerminalSquare` icon in that case. Adding the entry just makes the branded icon resolve.

## Touchpoint 5 — Tests

**File:** `apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts`

Add to the existing `describe("passthrough wrappers", ...)` block (the same block that contains tests for `amp`, `claude`, `droid`, etc.):

```ts
it("creates agy wrapper passthrough", () => {
  createAgyWrapper();
  const wrapperPath = path.join(TEST_BIN_DIR, "agy");
  const wrapper = readFileSync(wrapperPath, "utf-8");
  expect(wrapper).toContain("# Superset wrapper for agy");
  expect(wrapper).toContain('REAL_BIN="$(find_real_binary "agy")"');
  expect(wrapper).toContain('export SUPERSET_AGENT_ID="agy"');
  expect(wrapper).toContain('exec "$REAL_BIN" "$@"');
});
```

**Test infrastructure reuse:** the file's existing `mock.module` setup (lines 26-48) and `TEST_BIN_DIR` (line 89) cover the new file. The barrel re-export in touchpoint 2 means `createAgyWrapper` is importable via the existing `await import("./agent-wrappers")` at line 89. No new test setup.

**No new tests required for:**
- `agent-wrappers-gemini.ts` / `agent-wrappers-copilot.ts` per-agent hook script patterns (we don't ship a hook script)
- `notify-hook.test.ts` (no per-agent hook template to parameterize over)
- `agent-command.test.ts` (no non-default `promptTransport` or `--` separator; `promptCommand: "agy -p"` is the simple `argv` form)
- `agent-launch-request.test.ts` (no unusual task launch behavior)

**Typecheck coverage:** adding the manifest row exercises the `BuiltinAgentId` union (auto-derived), the `ManagedBinary` type alias (`agy` flows through `SUPERSET_MANAGED_BINARIES`), and the new `agy` target's `setupActions: ["agy-wrapper"]` type against `DESKTOP_AGENT_SETUP_ACTIONS`. If any of these don't align, `bun run typecheck` fails — a strong correctness signal.

**Lint coverage:** Biome runs at root, will catch any unused imports added to `agent-wrappers.ts` or `desktop-agent-capabilities.ts`.

## Data flow

### Launch path (user clicks "Antigravity" in agent picker)

```
User picks "Antigravity" in DiffPane/AgentPicker/Settings/etc.
  ↓
Terminal pane spawns ~/.superset/bin/agy
  ↓ (wrapper v3)
find_real_binary("agy") → /usr/local/bin/agy
  ↓
export SUPERSET_AGENT_ID="agy"
  ↓
exec /usr/local/bin/agy
  ↓
agy launches interactive TUI
```

### Setup path (user adds Antigravity via Settings → Agents)

```
User clicks "Set up" in Settings → Agents
  ↓
tRPC setupAgent({ agentId: "agy" })
  ↓
setupSingleAgent("agy")
  ↓
DESKTOP_AGENT_SETUP_BOOTSTRAP_ACTIONS run first
  ↓
DESKTOP_AGENT_SETUP_TARGETS.agy.setupActions = ["agy-wrapper"] runs
  ↓
createAgyWrapper() writes ~/.superset/bin/agy
  ↓
writeFileIfChanged no-ops if content matches
```

### Identity flow (today, hookless)

```
agy process has env: SUPERSET_AGENT_ID=agy
  ↓ (when agy ships hooks, they read this env)
Future hook handler reads SUPERSET_AGENT_ID
  ↓
POSTs to SUPERSET_HOST_AGENT_HOOK_URL with { agentId: "agy" }
  ↓
Host service normalizes + broadcasts agent:lifecycle
  ↓
Renderer shows working indicator
```

## Deferred work

**Notification hook integration is deferred** until antigravity-cli ships a documented hook system. When that happens:

1. The `SUPERSET_AGENT_ID=agy` env var is already in place. The notify script's v2 payload will carry `agentId: "agy"` automatically for any agy invocation through the wrapper.
2. The new hook integration is purely additive: a new file under `apps/desktop/src/main/lib/agent-setup/agent-wrappers-agy.ts` (e.g. `createAgySettingsJson()`), a new `templates/agy-hook.template.sh` if needed, and a new setup action id.
3. No schema migration. The receiver accepts any string for `agentId` and the renderer's `usePresetIcon` returns `undefined` for unknowns, so the picker and pane-header fall back gracefully.

The `apps/desktop/plans/20260601-antigravity-builtin-agent.md` plan file documents this as a follow-up, with a link to the upstream tracking issue.

## Files changed (summary)

| Status | File | Purpose |
|---|---|---|
| NEW | `apps/desktop/src/main/lib/agent-setup/agent-wrappers-agy.ts` | Wrapper generator for `~/.superset/bin/agy` |
| NEW | `packages/ui/src/assets/icons/preset-icons/agy.svg` | Light variant of Antigravity icon |
| NEW | `packages/ui/src/assets/icons/preset-icons/agy-dark.svg` | Dark variant of Antigravity icon |
| EDIT | `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts` | Barrel re-export of the new wrapper module |
| EDIT | `apps/desktop/src/main/lib/agent-setup/desktop-agent-capabilities.ts` | Add `agy-wrapper` action and `agy` target |
| EDIT | `apps/desktop/src/main/lib/agent-setup/desktop-agent-setup.ts` | Register `createAgyWrapper` runner |
| EDIT | `packages/shared/src/builtin-terminal-agents.ts` | Add agy manifest row |
| EDIT | `packages/ui/src/assets/icons/preset-icons/index.ts` | Register agy icon in `PRESET_ICONS` |
| EDIT | `apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts` | Add wrapper passthrough test |
| EDIT | `apps/desktop/docs/EXTERNAL_FILES.md` | Add `agy` row to `bin/` section |
| NEW | `apps/desktop/plans/20260601-antigravity-builtin-agent.md` | Plan file documenting ship + deferred hooks |

## Verification

After implementation, run from repo root:

```bash
bun run typecheck          # catches manifest/setup/ManagedBinary misalignment
bun run lint               # catches unused imports, format drift
bun test apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts
```

Manual verification on the desktop app:

1. Launch Superset desktop. Confirm `~/.superset/bin/agy` exists and is executable.
2. Open Settings → Agents. Confirm "Antigravity" appears in the agent list with the icon.
3. Open a terminal pane. Pick "Antigravity" from the agent picker. Confirm `agy` launches interactively.
4. `echo $SUPERSET_AGENT_ID` inside the launched terminal — should print `agy`.

## Open questions

None at ship time. The deferred hook work may surface new questions when antigravity-cli ships a hook format.
