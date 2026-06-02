# Antigravity CLI (`agy`) Built-in Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google's Antigravity CLI (`agy`) as a first-class built-in terminal agent in the Superset desktop app, matching the existing 5-touchpoint pattern used by Claude/Codex/Amp/OpenCode.

**Architecture:** One new wrapper module + manifest row + setup registry entries + icon asset + test. Notification hook integration is deferred because antigravity-cli v1.0.4 has no documented hook system yet. The `SUPERSET_AGENT_ID=agy` env var is exported by the wrapper so future hook integration is purely additive.

**Tech Stack:** TypeScript, Bun, Biome, shadcn-style SVG icons, `~/.superset/bin/agy` shell wrapper, Drizzle/Zustand/TanStack DB at the data layer (no DB changes).

**Spec:** `apps/desktop/docs/20260601-antigravity-builtin-agent-design.md`

**Worktree:** `apps/desktop`

---

## File Structure

### New files

| Path | Purpose |
|---|---|
| `apps/desktop/src/main/lib/agent-setup/agent-wrappers-agy.ts` | Wrapper generator for `~/.superset/bin/agy` |
| `packages/ui/src/assets/icons/preset-icons/agy.svg` | Light-variant Antigravity icon |
| `packages/ui/src/assets/icons/preset-icons/agy-white.svg` | Dark-variant Antigravity icon |
| `apps/desktop/plans/20260601-antigravity-builtin-agent.md` | Plan file documenting ship + deferred hooks |

### Modified files

| Path | What changes |
|---|---|
| `packages/shared/src/builtin-terminal-agents.ts` | One new row in `BUILTIN_TERMINAL_AGENTS` array |
| `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts` | Barrel re-export of new wrapper module |
| `apps/desktop/src/main/lib/agent-setup/desktop-agent-capabilities.ts` | Add `agy-wrapper` action + `agy` target |
| `apps/desktop/src/main/lib/agent-setup/desktop-agent-setup.ts` | Register `createAgyWrapper` runner |
| `packages/ui/src/assets/icons/preset-icons/index.ts` | Register agy icon in `PRESET_ICONS` + re-exports |
| `apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts` | One new `it("creates agy wrapper passthrough", ...)` test |
| `apps/desktop/docs/EXTERNAL_FILES.md` | Add `agy` row to `bin/` section |

### Order of changes

The order matters because the manifest must exist before the setup target references the new id, and the test must run against code that compiles.

1. **Wrapper + test (Task 1):** wrapper module + test. The test runs against the wrapper generator directly; the manifest/setup/registry are not yet wired.
2. **Setup registry (Task 2):** `desktop-agent-capabilities.ts` + `desktop-agent-setup.ts`. Order: capabilities first (defines types), then setup (uses them).
3. **Manifest (Task 3):** `builtin-terminal-agents.ts`. After this point, `agy` is a valid `BuiltinAgentId` and the `managedBinary` type-check in Task 2's `agy` target is satisfied.
4. **Barrel re-export (Task 4):** `agent-wrappers.ts`. Wires the new module into the test's `await import`.
5. **Icon (Task 5):** SVG files + `preset-icons/index.ts`.
6. **Docs (Task 6):** `EXTERNAL_FILES.md` table update + plan file.

Tasks are intentionally small and self-contained. Each ends with a `git commit`.

---

## Task 1: Wrapper module + test

**Files:**
- Create: `apps/desktop/src/main/lib/agent-setup/agent-wrappers-agy.ts`
- Modify: `apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts`

- [ ] **Step 1.1: Add failing test in `agent-wrappers.test.ts`**

Open `apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts`. Find the `it("creates droid wrapper passthrough", ...)` block (around line 553-563). Add the new test **immediately after it**:

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

Add `createAgyWrapper` to the destructured import at lines 59-89 of the test file. Insert it alphabetically between `createAmpPlugin` and `createAmpWrapper`:

```ts
const {
  // ... existing imports
  createAgyWrapper,  // NEW
  createAmpPlugin,
  createAmpWrapper,
  // ... rest
} = await import("./agent-wrappers");
```

- [ ] **Step 1.2: Run test to verify it fails**

Run from repo root:
```bash
bun test apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts -t "creates agy wrapper passthrough"
```

Expected: FAIL with `TypeError: createAgyWrapper is not a function` (or similar — the import resolves to `undefined`).

- [ ] **Step 1.3: Create the wrapper module**

Create `apps/desktop/src/main/lib/agent-setup/agent-wrappers-agy.ts`:

```ts
import {
  buildWrapperScript,
  createWrapper,
} from "./agent-wrappers-common";

/**
 * Creates the Antigravity CLI wrapper that preserves Superset's terminal
 * environment and exports SUPERSET_AGENT_ID="agy" so the agent process
 * inherits the wrapper-level identity. When antigravity-cli ships a hook
 * system, hooks reading the parent-process identity will pick up "agy"
 * automatically.
 */
export function createAgyWrapper(): void {
  const script = buildWrapperScript("agy", `exec "$REAL_BIN" "$@"`, {
    agentId: "agy",
  });
  createWrapper("agy", script);
}
```

- [ ] **Step 1.4: Re-run test to verify it still fails (wrapper exists, but barrel re-export missing)**

Run from repo root:
```bash
bun test apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts -t "creates agy wrapper passthrough"
```

Expected: FAIL with `TypeError: undefined is not a function` or `createAgyWrapper is not a function` — the test imports from `./agent-wrappers` (the barrel), not from `./agent-wrappers-agy` directly.

- [ ] **Step 1.5: Commit wrapper module + failing test**

```bash
git add apps/desktop/src/main/lib/agent-setup/agent-wrappers-agy.ts apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts
git commit -m "feat(desktop): add agy wrapper generator and passthrough test"
```

---

## Task 2: Wire wrapper into barrel re-export

**Files:**
- Modify: `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts:1-84`

- [ ] **Step 2.1: Add barrel re-export**

Open `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts`. The existing re-exports are grouped by source file, ordered alphabetically by source filename. Add a new `export { createAgyWrapper } from "./agent-wrappers-agy";` block at the **top** of the file (before `agent-wrappers-amp`), since "agy" < "amp" alphabetically:

```ts
export { createAgyWrapper } from "./agent-wrappers-agy";
export {
  AMP_PLUGIN_FILE,
  AMP_PLUGIN_MARKER,
  createAmpPlugin,
  // ... existing
} from "./agent-wrappers-amp";
```

- [ ] **Step 2.2: Run test to verify it passes**

Run from repo root:
```bash
bun test apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts -t "creates agy wrapper passthrough"
```

Expected: PASS. The test asserts that the wrapper at `TEST_BIN_DIR/agy` contains the expected strings.

- [ ] **Step 2.3: Commit barrel re-export**

```bash
git add apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts
git commit -m "feat(desktop): re-export createAgyWrapper from agent-wrappers barrel"
```

---

## Task 3: Add `agy` to setup registry

**Files:**
- Modify: `apps/desktop/src/main/lib/agent-setup/desktop-agent-capabilities.ts:5-29, 45-102`
- Modify: `apps/desktop/src/main/lib/agent-setup/desktop-agent-setup.ts:1-86`

- [ ] **Step 3.1: Add `agy-wrapper` action to `DESKTOP_AGENT_SETUP_ACTIONS`**

In `desktop-agent-capabilities.ts`, the `DESKTOP_AGENT_SETUP_ACTIONS` array (lines 5-29) is **not strictly alphabetical** — it groups bootstrap actions first (`notify-script`, `cleanup-global-opencode-plugin`) then per-agent actions. Insert `"agy-wrapper"` immediately before `"amp-plugin"` (line 8) to match the existing convention of per-agent actions ordered alphabetically after bootstrap:

```ts
export const DESKTOP_AGENT_SETUP_ACTIONS = [
  "notify-script",
  "cleanup-global-opencode-plugin",
  "agy-wrapper",       // NEW
  "amp-plugin",
  "amp-wrapper",
  // ... rest unchanged
] as const;
```

- [ ] **Step 3.2: Add `agy` target to `DESKTOP_AGENT_SETUP_TARGETS`**

In the same file, `DESKTOP_AGENT_SETUP_TARGETS` (lines 45-102) is **mostly alphabetical with `cursor-agent` and `pi` inserted later** (likely historical). The first three targets are `amp, claude, codex`. Insert the `agy` target **before** `amp` (the `a`-group is alphabetical, so `agy` < `amp`):

```ts
export const DESKTOP_AGENT_SETUP_TARGETS = [
  {
    id: "agy",
    setupActions: ["agy-wrapper"],
    managedBinary: true,
  },
  {
    id: "amp",
    setupActions: ["amp-plugin", "amp-wrapper"],
    managedBinary: true,
  },
  // ... rest unchanged
] as const satisfies readonly DesktopAgentSetupTarget[];
```

- [ ] **Step 3.3: Run typecheck to verify the new target typechecks**

Run from repo root:
```bash
bun run typecheck
```

Expected: PASS. The `id: "agy"` field is checked against `AgentType` (from `@superset/shared/agent-command`). At this point the manifest row (Task 4) does **not** exist yet, so the type `AgentType` does **not** include `"agy"`. The typecheck may fail with `Type '"agy"' is not assignable to type 'AgentType'`. This is expected — the type-check is the next task's signal.

If the typecheck fails because `"agy"` is not in `AgentType`:
- Note the error and continue. The error is the cross-task type dependency the next task resolves.

If the typecheck passes (i.e. `AgentType` is a `string` at this point and accepts any string):
- Continue to step 3.4.

- [ ] **Step 3.4: Add the runner to `DESKTOP_AGENT_SETUP_RUNNERS`**

In `apps/desktop/src/main/lib/agent-setup/desktop-agent-setup.ts`, the import block at lines 1-24 is grouped by source file. Add `createAgyWrapper` to the import from `./agent-wrappers`, **alphabetically** before `createAmpPlugin` and `createAmpWrapper`:

```ts
import {
  cleanupGlobalOpenCodePlugin,
  createAgyWrapper,        // NEW
  createAmpPlugin,
  createAmpWrapper,
  // ... rest
} from "./agent-wrappers";
```

Then in the `DESKTOP_AGENT_SETUP_RUNNERS` record (lines 32-57), insert `"agy-wrapper"` immediately after `"cleanup-global-opencode-plugin"` (matching the position in the actions array):

```ts
const DESKTOP_AGENT_SETUP_RUNNERS: Record<DesktopAgentSetupAction, () => void> =
  {
    "notify-script": createNotifyScript,
    "cleanup-global-opencode-plugin": cleanupGlobalOpenCodePlugin,
    "agy-wrapper": createAgyWrapper,    // NEW
    "amp-plugin": createAmpPlugin,
    "amp-wrapper": createAmpWrapper,
    // ... rest unchanged
  };
```

- [ ] **Step 3.5: Re-run typecheck**

Run from repo root:
```bash
bun run typecheck
```

Expected: still failing on `Type '"agy"' is not assignable to type 'AgentType'` (same as step 3.3). This is the cross-task signal that the manifest row in Task 4 is needed.

- [ ] **Step 3.6: Commit setup registry changes**

```bash
git add apps/desktop/src/main/lib/agent-setup/desktop-agent-capabilities.ts apps/desktop/src/main/lib/agent-setup/desktop-agent-setup.ts
git commit -m "feat(desktop): register agy-wrapper setup action and target"
```

---

## Task 4: Add `agy` row to manifest

**Files:**
- Modify: `packages/shared/src/builtin-terminal-agents.ts:59-140`

- [ ] **Step 4.1: Add `agy` row to `BUILTIN_TERMINAL_AGENTS`**

In `packages/shared/src/builtin-terminal-agents.ts`, the `BUILTIN_TERMINAL_AGENTS` array (lines 59-140) is **not strictly alphabetical** — it follows the order `claude, amp, codex, gemini, mastracode, opencode, pi, copilot, cursor-agent, droid`. The natural place for `agy` is **immediately after `claude`** (alphabetical, "agy" comes after "claude" only because "ag" < "cl" — actually "agy" < "amp" < "claude" alphabetically). Insert `agy` between `claude` and `amp` to maintain alphabetical order in the "a" prefix group:

```ts
export const BUILTIN_TERMINAL_AGENTS = [
  createBuiltinTerminalAgent({
    id: "claude",
    // ... existing
  }),
  createBuiltinTerminalAgent({
    id: "agy",
    label: "Antigravity",
    description:
      "Google's agentic development platform — multi-step reasoning, parallel sub-agents, and project context via AGENTS.md.",
    command: "agy",
    promptCommand: "agy -p",
    includeInDefaultTerminalPresets: true,
  }),
  createBuiltinTerminalAgent({
    id: "amp",
    // ... existing
  }),
  // ... rest unchanged
] as const;
```

**Field rationale (no changes from the spec):**
- `id: "agy"` — wire-level identity; must match `SUPERSET_AGENT_ID` exactly.
- `label: "Antigravity"` — product name used in pickers, settings list, pane header.
- `description` — names the three distinguishing features (multi-step reasoning, parallel sub-agents, AGENTS.md context).
- `command: "agy"` — default interactive launch. No `--dangerously-skip-permissions` (user opts in via Settings → Permissions).
- `promptCommand: "agy -p"` — headless print mode. **Known issue:** antigravity-cli#76 documents that `agy -p` in non-TTY mode currently produces no output. Upstream fix is out of scope.
- `includeInDefaultTerminalPresets: true` — shows in Settings → Agents by default, matching Claude/Codex/Amp/Copilot.

- [ ] **Step 4.2: Run typecheck to verify the new row typechecks against `AgentType`**

Run from repo root:
```bash
bun run typecheck
```

Expected: PASS. The new `"agy"` literal flows through `AgentType` (the union derived from `BUILTIN_AGENT_IDS` in `agent-catalog.ts:23`), which means the `agy` target added in Task 3 now typechecks.

- [ ] **Step 4.3: Run the wrapper test to confirm nothing regressed**

Run from repo root:
```bash
bun test apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts
```

Expected: PASS. All existing tests still pass, and the new `agy` test passes.

- [ ] **Step 4.4: Commit manifest row**

```bash
git add packages/shared/src/builtin-terminal-agents.ts
git commit -m "feat(shared): add agy to BUILTIN_TERMINAL_AGENTS manifest"
```

---

## Task 5: Add icon assets

**Files:**
- Create: `packages/ui/src/assets/icons/preset-icons/agy.svg`
- Create: `packages/ui/src/assets/icons/preset-icons/agy-white.svg`
- Modify: `packages/ui/src/assets/icons/preset-icons/index.ts:1-66`

- [ ] **Step 5.1: Copy the source SVG to both new files**

The Antigravity CLI and Antigravity editor share the same product branding. The existing icon is at `apps/desktop/src/renderer/assets/app-icons/antigravity.svg`. Copy its contents verbatim to two new files in the preset-icons directory:

```bash
cp apps/desktop/src/renderer/assets/app-icons/antigravity.svg packages/ui/src/assets/icons/preset-icons/agy.svg
cp apps/desktop/src/renderer/assets/app-icons/antigravity.svg packages/ui/src/assets/icons/preset-icons/agy-white.svg
```

This matches the existing `pi.svg` / `pi-white.svg` and `droid.svg` / `droid-white.svg` naming pattern: `<name>.svg` for the light variant, `<name>-white.svg` for the dark variant. (Note: the spec draft called the dark variant `agy-dark.svg`; this plan corrects that to match existing convention.)

- [ ] **Step 5.2: Add imports to `preset-icons/index.ts`**

In `packages/ui/src/assets/icons/preset-icons/index.ts`, add two new imports at the **top** of the import block (alphabetical, `agyIcon` and `agyWhiteIcon` come before `ampIcon`):

```ts
import agyIcon from "./agy.svg";
import agyWhiteIcon from "./agy-white.svg";
import ampIcon from "./amp.svg";
// ... rest unchanged
```

- [ ] **Step 5.3: Register agy in `PRESET_ICONS`**

In the same file, `PRESET_ICONS` (lines 24-36) is in a "by name" order, with `cursor-agent` and `droid` after the alphabetical group. Insert `agy` **before** `amp` to maintain alphabetical order in the leading group:

```ts
export const PRESET_ICONS: Record<string, PresetIconSet> = {
  agy: { light: agyIcon, dark: agyWhiteIcon },  // NEW
  amp: { light: ampIcon, dark: ampIcon },
  // ... rest unchanged
};
```

- [ ] **Step 5.4: Add icon re-exports**

The file re-exports individual icon imports at the bottom (lines 48-66) so callers can import them by name. Add `agyIcon` and `agyWhiteIcon` to that re-export block in alphabetical position:

```ts
export {
  agyIcon,        // NEW
  agyWhiteIcon,   // NEW
  ampIcon,
  // ... rest unchanged
};
```

- [ ] **Step 5.5: Run typecheck to verify icon registration typechecks**

Run from repo root:
```bash
bun run typecheck
```

Expected: PASS. The new imports resolve to SVG modules.

- [ ] **Step 5.6: Commit icon assets + registration**

```bash
git add packages/ui/src/assets/icons/preset-icons/agy.svg packages/ui/src/assets/icons/preset-icons/agy-white.svg packages/ui/src/assets/icons/preset-icons/index.ts
git commit -m "feat(ui): add agy preset icon (light + dark variants)"
```

---

## Task 6: Documentation + plan file

**Files:**
- Modify: `apps/desktop/docs/EXTERNAL_FILES.md:16-25`
- Create: `apps/desktop/plans/20260601-antigravity-builtin-agent.md`

- [ ] **Step 6.1: Add `agy` row to `EXTERNAL_FILES.md` bin/ table**

In `apps/desktop/docs/EXTERNAL_FILES.md`, the `bin/` table at lines 18-24 lists existing wrappers. Insert a new row for `agy` **immediately after** `amp` (alphabetical with the other `a`-prefix wrappers). The new row is:

```md
| `agy` | Wrapper for Antigravity CLI that preserves Superset terminal context |
```

The full table after the edit:

```md
| File | Purpose |
|------|---------|
| `agy` | Wrapper for Antigravity CLI that preserves Superset terminal context |
| `amp` | Wrapper for Amp CLI that preserves Superset terminal context |
| `claude` | Wrapper for Claude Code CLI that injects notification hooks |
| `codex` | Wrapper for Codex CLI that injects notification hooks |
| `droid` | Wrapper for Factory Droid CLI that preserves Superset hook integration |
| `opencode` | Wrapper for OpenCode CLI that sets `OPENCODE_CONFIG_DIR` |
```

- [ ] **Step 6.2: Create the plan file**

Create `apps/desktop/plans/20260601-antigravity-builtin-agent.md` with the following content:

```md
# Ship: Antigravity CLI (`agy`) built-in agent

- **Status:** Shipped
- **Date:** 2026-06-01
- **Source issue:** https://github.com/superset-sh/superset/issues/4986
- **Design:** `apps/desktop/docs/20260601-antigravity-builtin-agent-design.md`

## What shipped

Five-touchpoint integration matching the existing pattern for built-in terminal agents:

1. `packages/shared/src/builtin-terminal-agents.ts` — `agy` row in `BUILTIN_TERMINAL_AGENTS` (`command: "agy"`, `promptCommand: "agy -p"`, `includeInDefaultTerminalPresets: true`)
2. `apps/desktop/src/main/lib/agent-setup/agent-wrappers-agy.ts` — pass-through wrapper emitting `~/.superset/bin/agy` with `SUPERSET_AGENT_ID="agy"`
3. `apps/desktop/src/main/lib/agent-setup/desktop-agent-capabilities.ts` + `desktop-agent-setup.ts` — `agy-wrapper` setup action and `agy` target with `managedBinary: true`
4. `packages/ui/src/assets/icons/preset-icons/agy.svg` + `agy-white.svg` and registration in `PRESET_ICONS`
5. `apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts` — passthrough wrapper test

## What did NOT ship (deferred)

**Notification hook integration.** antigravity-cli v1.0.4 (released 2026-06-01) does not expose a `settings.json`, plugin, or extension model. There is no documented hook format to integrate against.

When antigravity-cli ships a hook system, the migration is purely additive:

- `SUPERSET_AGENT_ID=agy` is already exported by the wrapper. Any hook handler that reads the parent-process identity will see the correct value automatically.
- The notify script's v2 payload will carry `agentId: "agy"` without further wiring.
- The new integration is one new file (e.g. `createAgySettingsJson()`) and one new setup action id, with no schema migration.

The renderer and host-service already accept any string for `agentId`; the `usePresetIcon` hook returns `undefined` for unknown names so pickers degrade gracefully.

## Known issue

`agy -p` in non-TTY mode currently produces no output. See https://github.com/google-antigravity/antigravity-cli/issues/76. The manifest still registers `promptCommand: "agy -p"` because that's the documented headless flag. Upstream fix is out of scope for this ship.

## Verification

- `bun run typecheck` — passes
- `bun run lint` — passes
- `bun test apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts` — passes
- Manual: launch Superset desktop, confirm `~/.superset/bin/agy` exists, "Antigravity" appears in agent pickers, `echo $SUPERSET_AGENT_ID` inside the launched terminal prints `agy`.
```

- [ ] **Step 6.3: Commit documentation + plan**

```bash
git add apps/desktop/docs/EXTERNAL_FILES.md apps/desktop/plans/20260601-antigravity-builtin-agent.md
git commit -m "docs(desktop): document agy wrapper and ship plan"
```

---

## Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 7.1: Run typecheck, lint, and tests from repo root**

```bash
bun run typecheck
bun run lint
bun test apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts
```

Expected: all three commands exit 0 with no output (or with non-error output).

- [ ] **Step 7.2: Verify the wrapper file would be generated correctly**

Sanity-check the wrapper content by inspecting the installed wrapper file (if available) or by running the test in verbose mode:

```bash
ls -la ~/.superset/bin/agy 2>/dev/null || echo "wrapper not yet installed (expected on a fresh worktree)"
bun test apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts -t "creates agy wrapper passthrough" --verbose
```

Expected: the test passes, confirming the generated wrapper at `TEST_BIN_DIR/agy` contains all four expected strings. The installed `~/.superset/bin/agy` only exists after the desktop app has been launched at least once in this worktree — that's a manual verification, not a unit-test concern.

- [ ] **Step 7.3: Inspect final git log**

```bash
git log --oneline -10
```

Expected: 6 commits (one per task), all with conventional commit prefixes (`feat(...)` or `docs(...)`).

---

## Notes

### TDD ordering

Each task that has a test follows the red-green-refactor cycle:
- Test written first
- Test fails (imports / function missing)
- Implementation added
- Test passes

The manifest (Task 4) is intentionally **not** TDD-driven because it has no meaningful test target — it's a data row whose correctness is exercised indirectly by `bun run typecheck` and by manual UI verification (Antigravity appears in pickers).

### Cross-task type dependencies

`AgentType` (from `agent-catalog.ts:23`) is derived from `BUILTIN_AGENT_IDS = [...BUILTIN_TERMINAL_AGENT_TYPES, "superset"]`. This means:

- Adding `agy` to `BUILTIN_TERMINAL_AGENTS` (Task 4) is what makes the `id: "agy"` field in the setup target (Task 3) typecheck.
- The typecheck intentionally fails at the end of Task 3 and passes at the end of Task 4 — that's the cross-task signal.

If `AgentType` is `string` (not a union), the typecheck passes at Task 3. Either way, the work is correct; the typecheck is a signal, not a gate.

### Worktree isolation

Per AGENTS.md, worktrees set `SUPERSET_HOME_DIR` per-worktree (e.g. `superset-dev-data` instead of `~/.superset`). The wrapper marker regex in `agent-wrappers-common.ts:12-13` already recognizes both `~/.superset-*/` and `*/superset-dev-data/` variants, so the wrapper works correctly in worktree dev mode.

### Verification before completion

Per the verification-before-completion skill, do not claim completion until all three commands in Step 7.1 have been run and have exited 0 with the expected output. Capture the output for the PR description.
