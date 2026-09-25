# Mistral Vibe First-Class Agent — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register `vibe` (Mistral Vibe) as a first-class terminal coding agent in Superset — selectable everywhere with its own icon, launching into a PTY pane with a seeded prompt, an env-based model picker, and full working-indicator + completion-chime lifecycle hooks.

**Architecture:** Add one manifest entry to the derived `BUILTIN_TERMINAL_AGENTS` registry (everything type/label/preset/wire derives from it). Extend the shared model layer to deliver a model via an env var (`VIBE_ACTIVE_MODEL`) because Vibe has no `--model` flag. Wire desktop lifecycle hooks by generating a managed `vibe` PATH-wrapper (sets `VIBE_ENABLE_EXPERIMENTAL_HOOKS=true`) plus a marker-guarded `~/.vibe/hooks.toml` whose `before_tool`/`post_agent_turn` hooks call Superset's existing notify script; map those two events server-side.

**Tech Stack:** TypeScript, Bun (`bun test`), Biome (`bun run lint` / `lint:fix`), Turborepo. Design spec: `plans/20260709-mistral-vibe-agent-first-class.md`.

**Design decisions locked in the spec:** id `vibe` (not `mistral` — avoids the LLM-provider id collision); command `vibe --trust --auto-approve`; env-based model picker; full lifecycle hooks; no Vibe changes required; MCP + ACP out of scope.

---

## Prerequisites

- [ ] Confirm you are on branch `feat/mistral-vibe-agent` (created during brainstorming). `git branch --show-current`.
- [ ] Runtime prerequisite for smoke testing only (not code): `vibe` installed on PATH and `MISTRAL_API_KEY` set (or `vibe --setup` run). Vibe self-authenticates like Claude/Codex — no Superset auth code.

## File Structure

**Create:**
- `packages/ui/src/assets/icons/preset-icons/vibe.svg` + `vibe-white.svg` — icon assets (placeholder monogram; requester supplies the official mark later).
- `apps/desktop/src/main/lib/agent-setup/agent-wrappers-vibe.ts` — the `vibe` PATH-wrapper + `~/.vibe/hooks.toml` writer.

**Modify:**
- `packages/shared/src/builtin-terminal-agents.ts` — registry entry (Chunk 1).
- `packages/ui/src/assets/icons/preset-icons/index.ts` — icon wiring (Chunk 1).
- `apps/desktop/.../AgentIconPicker/agent-icon-options.ts` — custom-agent icon option (Chunk 1).
- `apps/desktop/.../useDefaultV2TerminalPresets/default-v2-terminal-presets.ts` — default tab (Chunk 1).
- `packages/shared/src/agent-models.ts` + `agent-models.test.ts` — env-based model support (Chunk 2).
- `packages/host-service/src/trpc/router/agents/agents.ts` — inject model env at launch (Chunk 2).
- `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts` — barrel export (Chunk 3).
- `apps/desktop/src/main/lib/agent-setup/desktop-agent-capabilities.ts` — actions + target (Chunk 3).
- `apps/desktop/src/main/lib/agent-setup/desktop-agent-setup.ts` — runners map (Chunk 3).
- `packages/host-service/src/events/map-event-type.ts` + `map-event-type.test.ts` — event mapping (Chunk 3).
- `apps/desktop/.../agent-setup/agent-wrappers.test.ts` — wrapper + hooks.toml tests (Chunk 3).
- `apps/desktop/.../settings-search/settings-search.ts`, root `AGENTS.md`, marketing/docs surfaces (Chunk 4).

---

## Chunk 1: Registry, icon, and default selection

Outcome: `vibe` appears in every agent picker with an icon and launches `vibe --trust --auto-approve` (+ seeded prompt).

### Task 1.1: Register the `vibe` terminal agent

**Files:**
- Modify: `packages/shared/src/builtin-terminal-agents.ts` (insert after the `copilot` entry, ~line 126)
- Test: `packages/shared/src/agent-command.test.ts`

- [ ] **Step 1: Write the failing test** — append to `agent-command.test.ts`:

```ts
import { AGENT_LABELS, AGENT_TYPES } from "./agent-command";

describe("vibe agent registration", () => {
  it("is a registered terminal agent with the right label", () => {
    expect(AGENT_TYPES).toContain("vibe");
    expect(AGENT_LABELS.vibe).toBe("Mistral Vibe");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/shared/src/agent-command.test.ts`
Expected: FAIL (`vibe` not in `AGENT_TYPES`).

- [ ] **Step 3: Add the manifest entry** in `builtin-terminal-agents.ts`, immediately after the `copilot` `createBuiltinTerminalAgent({...})` block:

```ts
	createBuiltinTerminalAgent({
		id: "vibe",
		label: "Mistral Vibe",
		description:
			"Mistral's coding agent for reading, editing, and running code from the terminal.",
		command: "vibe --trust --auto-approve",
		includeInDefaultTerminalPresets: true,
	}),
```

(No `promptCommand`/`promptTransport` — the default `argv` transport appends the prompt as a positional, which Vibe's TUI auto-submits, exactly like the `claude` entry.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/shared/src/agent-command.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/builtin-terminal-agents.ts packages/shared/src/agent-command.test.ts
git commit -m "feat(shared): register Mistral Vibe as a builtin terminal agent"
```

### Task 1.2: Add the Vibe icon assets + wiring

**Files:**
- Create: `packages/ui/src/assets/icons/preset-icons/vibe.svg`, `packages/ui/src/assets/icons/preset-icons/vibe-white.svg`
- Modify: `packages/ui/src/assets/icons/preset-icons/index.ts`

- [ ] **Step 1: Create placeholder SVGs** (replace with the official Mistral mark when supplied). `vibe.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="5" fill="#FA520F"/><path d="M6 17V7h2.6l3.4 5 3.4-5H18v10h-2.4v-6l-3 4.4-3-4.4v6H6z" fill="#fff"/></svg>
```

`vibe-white.svg` (dark-mode variant — white glyph on transparent):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="5" fill="#1a1a1a"/><path d="M6 17V7h2.6l3.4 5 3.4-5H18v10h-2.4v-6l-3 4.4-3-4.4v6H6z" fill="#fff"/></svg>
```

- [ ] **Step 2: Wire `index.ts`** — add the imports (with the other `import … from "./*.svg"` lines):

```ts
import vibeIcon from "./vibe.svg";
import vibeWhiteIcon from "./vibe-white.svg";
```

Add to `PRESET_ICONS` (key MUST be exactly `vibe`):

```ts
	vibe: { light: vibeIcon, dark: vibeWhiteIcon },
```

Add to the bottom re-export block:

```ts
	vibeIcon,
	vibeWhiteIcon,
```

- [ ] **Step 3: Verify typecheck + a quick assertion.** Add to `agent-command.test.ts` (or a ui test if the SVG import resolves there; if `.svg` imports don't resolve under `bun test` in `packages/ui`, skip the unit assertion and rely on typecheck):

Run: `bun run typecheck`
Expected: PASS (SVG imports resolve, `PRESET_ICONS.vibe` typed).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/assets/icons/preset-icons/vibe.svg packages/ui/src/assets/icons/preset-icons/vibe-white.svg packages/ui/src/assets/icons/preset-icons/index.ts
git commit -m "feat(ui): add Mistral Vibe preset icon (placeholder pending official mark)"
```

### Task 1.3: Custom-agent icon option + default terminal preset

**Files:**
- Modify: `apps/desktop/.../AgentIconPicker/agent-icon-options.ts`
- Modify: `apps/desktop/.../useDefaultV2TerminalPresets/default-v2-terminal-presets.ts`

- [ ] **Step 1: Add the icon option** to `AGENT_ICON_OPTIONS`:

```ts
	{ id: "vibe", label: "Mistral Vibe" },
```

- [ ] **Step 2: Seed as a default terminal tab** — add `"vibe"` to `DEFAULT_V2_TERMINAL_PRESET_IDS` (position = tab order; append after `"copilot"`):

```ts
export const DEFAULT_V2_TERMINAL_PRESET_IDS = [
	"claude",
	"codex",
	"opencode",
	"copilot",
	"vibe",
] as const;
```

(This list and the registry `includeInDefaultTerminalPresets` flag are independent; both now include `vibe`.)

- [ ] **Step 3: Verify typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/routes/_authenticated/settings/agents/components/V2AgentsSettings/components/AgentIconPicker/agent-icon-options.ts apps/desktop/src/renderer/routes/_authenticated/components/AgentHooks/hooks/useDefaultV2TerminalPresets/default-v2-terminal-presets.ts
git commit -m "feat(desktop): offer Mistral Vibe icon and seed it as a default terminal preset"
```

### Task 1.4: Chunk 1 quality gate

- [ ] Run `bun run lint:fix` then `bun run lint` — expect **0 output** (CI treats warnings as errors; AGENTS.md rule #7).
- [ ] Run `bun run typecheck` — expect PASS.
- [ ] If lint made changes: `git add -A && git commit -m "chore: lint"`.

---

## Chunk 2: Env-based model picker

Outcome: selecting a model for `vibe` prepends `VIBE_ACTIVE_MODEL=<id>` to the launch command. Vibe has no `--model` flag, so the model rides an env var.

### Task 2.1: `modelEnv` support + `buildAgentModelEnv`

**Files:**
- Modify: `packages/shared/src/agent-models.ts`
- Test: `packages/shared/src/agent-models.test.ts`

- [ ] **Step 1a: Add `buildAgentModelEnv` to the existing import** at the top of `agent-models.test.ts` (the file already imports `buildAgentModelArgs`, `getAgentModelSupport`, etc. — add `buildAgentModelEnv` to that same import block; do NOT add a second `import … from "./agent-models"`).

- [ ] **Step 1b: Amend the existing invariant test.** The current test `it("has a CLI flag for every terminal preset and none for superset")` (`agent-models.test.ts:23-31`) asserts every non-`superset` entry has `modelFlag === "--model"`. The new env-based `vibe` entry (`modelFlag: null`) would fail it. Replace that test with:

```ts
	it("has a model flag, a model env, or (superset) neither", () => {
		for (const entry of AGENT_MODEL_SUPPORT) {
			if (entry.presetId === "superset") {
				expect(entry.modelFlag).toBeNull();
			} else if (entry.modelEnv) {
				// env-based presets (Vibe) carry the model via an env var, no flag
				expect(entry.modelFlag).toBeNull();
			} else {
				expect(entry.modelFlag).toBe("--model");
			}
		}
	});
```

- [ ] **Step 1c: Write the failing `buildAgentModelEnv` tests** — append to `agent-models.test.ts` (no import line — added in Step 1a):

```ts
describe("buildAgentModelEnv (vibe)", () => {
  it("returns VIBE_ACTIVE_MODEL for a valid vibe model", () => {
    expect(buildAgentModelEnv("vibe", "mistral-medium-3.5")).toEqual({
      VIBE_ACTIVE_MODEL: "mistral-medium-3.5",
    });
  });
  it("returns {} for an unknown model id (degrade to Vibe default)", () => {
    expect(buildAgentModelEnv("vibe", "not-a-model")).toEqual({});
  });
  it("returns {} when no model is selected", () => {
    expect(buildAgentModelEnv("vibe", undefined)).toEqual({});
  });
  it("returns {} for a preset without modelEnv", () => {
    expect(buildAgentModelEnv("claude", "opus")).toEqual({});
  });
  it("keeps buildAgentModelArgs empty for vibe (no --model flag)", () => {
    expect(buildAgentModelArgs("vibe", "mistral-medium-3.5")).toEqual([]);
  });
  it("exposes a vibe model catalog", () => {
    expect(getAgentModelSupport("vibe")?.models.map((m) => m.id)).toEqual([
      "mistral-medium-3.5",
      "devstral-small",
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test packages/shared/src/agent-models.test.ts`
Expected: FAIL (`buildAgentModelEnv` not exported; no `vibe` entry).

- [ ] **Step 3: Implement.** In `agent-models.ts`:
  - Add `modelEnv` to the interface:

```ts
export interface AgentModelSupport {
	presetId: string;
	modelFlag: string | null;
	/**
	 * Env var that carries the model when the CLI has no model flag (e.g. Vibe's
	 * `VIBE_ACTIVE_MODEL`). Mutually exclusive with `modelFlag` in practice.
	 */
	modelEnv?: string;
	models: AgentModelOption[];
}
```

  - Add the `vibe` entry to `AGENT_MODEL_SUPPORT` (before the `superset` entry):

```ts
	{
		presetId: "vibe",
		modelFlag: null,
		modelEnv: "VIBE_ACTIVE_MODEL",
		models: [
			{ id: "mistral-medium-3.5", label: "Mistral Medium 3.5" },
			{ id: "devstral-small", label: "Devstral Small" },
		],
	},
```

  - Add the builder near `buildAgentModelArgs`:

```ts
/**
 * Env vars that select `model` for env-based agents (Vibe has no `--model`
 * flag; the model rides `VIBE_ACTIVE_MODEL`). Same degrade-to-default contract
 * as `buildAgentModelArgs`: unknown presets, presets without `modelEnv`, an
 * unset model, or a model id outside the curated list return `{}`.
 */
export function buildAgentModelEnv(
	presetId: string,
	model: string | undefined,
): Record<string, string> {
	if (!model) return {};
	const support = getAgentModelSupport(presetId);
	if (!support?.modelEnv) return {};
	if (!support.models.some((option) => option.id === model)) return {};
	return { [support.modelEnv]: model };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test packages/shared/src/agent-models.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/agent-models.ts packages/shared/src/agent-models.test.ts
git commit -m "feat(shared): support env-based model selection (VIBE_ACTIVE_MODEL) for Vibe"
```

### Task 2.2: Inject the model env at launch

**Files:**
- Modify: `packages/host-service/src/trpc/router/agents/agents.ts` (`runTerminalAgent`, ~line 254-260, and the import from `@superset/shared/agent-models`)

- [ ] **Step 1: Import** `buildAgentModelEnv` alongside the existing `buildAgentModelArgs`/`buildAgentEffortArgs` import.

- [ ] **Step 2: Merge the model env into the overlay.** In `runTerminalAgent`, after `const command = buildAgentCommandString(...)`, change the `fullCommand` line:

```ts
	const modelEnv = buildAgentModelEnv(config.presetId, input.model);
	const fullCommand = `${envOverlayPrefix({ ...config.env, ...modelEnv })}${command}`;
```

(`buildAgentModelArgs`/`buildAgentEffortArgs` remain unchanged — they return `[]` for `vibe`, so no stray `--model` flag is emitted.)

- [ ] **Step 3: Verify typecheck + existing agents tests still pass**

Run: `bun run typecheck` then `bun test packages/host-service/src/trpc/router/agents/agents.test.ts`
Expected: PASS (existing tests use `env: {}` and no model → overlay unchanged for other agents).

- [ ] **Step 4: Commit**

```bash
git add packages/host-service/src/trpc/router/agents/agents.ts
git commit -m "feat(host-service): inject VIBE_ACTIVE_MODEL into the Vibe launch env"
```

### Task 2.3: Chunk 2 quality gate

- [ ] `bun run lint:fix && bun run lint` → 0 output.
- [ ] `bun run typecheck` → PASS.
- [ ] Commit any lint changes.

---

## Chunk 3: Lifecycle hooks (working indicator + completion chime)

Outcome: launching Vibe drives the working indicator (`before_tool → Start`) and the completion chime (`post_agent_turn → Stop`, fires once when the agent goes idle). Implemented via a managed `vibe` PATH-wrapper that enables Vibe's experimental hooks and a marker-guarded `~/.vibe/hooks.toml` that calls Superset's existing notify script.

**Key facts (verified):** Vibe runs a hook `command` via `create_subprocess_shell` (shell-interpreted, inherits env), piping the invocation JSON on stdin. Superset's notify script reads `hook_event_name` from stdin and POSTs `{ terminalId, eventType, agent }` using the `SUPERSET_*` env already injected into the PTY. Hooks require `enable_experimental_hooks` → set `VIBE_ENABLE_EXPERIMENTAL_HOOKS=true` in the wrapper. Global hooks file is `~/.vibe/hooks.toml`.

### Task 3.1: Map the two Vibe events

**Files:**
- Modify: `packages/host-service/src/events/map-event-type.ts`
- Test: `packages/host-service/src/events/map-event-type.test.ts`

- [ ] **Step 1: Write failing tests** — add to `map-event-type.test.ts`:

```ts
it("maps Vibe hook events", () => {
  expect(mapEventType("before_tool")).toBe("Start");
  expect(mapEventType("post_agent_turn")).toBe("Stop");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test packages/host-service/src/events/map-event-type.test.ts`
Expected: FAIL (`before_tool`/`post_agent_turn` return null).

- [ ] **Step 3: Implement.** In `map-event-type.ts`, add `"before_tool"` to the `Start` branch condition and `"post_agent_turn"` to the `Stop` branch condition:

```ts
	// in the Start branch:
		eventType === "task_started" ||
		eventType === "before_tool"
	) {
		return "Start";
	}
	// in the Stop branch:
		eventType === "task_complete" ||
		eventType === "post_agent_turn"
	) {
		return "Stop";
	}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test packages/host-service/src/events/map-event-type.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/host-service/src/events/map-event-type.ts packages/host-service/src/events/map-event-type.test.ts
git commit -m "feat(host-service): map Vibe before_tool/post_agent_turn to Start/Stop"
```

### Task 3.2: Vibe wrapper + `~/.vibe/hooks.toml` writer

**Files:**
- Create: `apps/desktop/src/main/lib/agent-setup/agent-wrappers-vibe.ts`
- Test: `apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts`

- [ ] **Step 1: Write failing tests** — add to `agent-wrappers.test.ts`:

```ts
import {
  getVibeHooksTomlContent,
  getVibeWrapperScript,
  VIBE_HOOKS_MARKER_END,
  VIBE_HOOKS_MARKER_START,
} from "./agent-wrappers-vibe";

describe("vibe wrapper", () => {
  it("enables experimental hooks and stamps the agent id", () => {
    const script = getVibeWrapperScript();
    expect(script).toContain('export SUPERSET_AGENT_ID="vibe"');
    expect(script).toContain("export VIBE_ENABLE_EXPERIMENTAL_HOOKS=true");
    expect(script).toContain('exec "$REAL_BIN" "$@"');
  });
});

describe("vibe hooks.toml", () => {
  it("writes both managed hooks inside markers on an empty file", () => {
    const out = getVibeHooksTomlContent("");
    expect(out).toContain(VIBE_HOOKS_MARKER_START);
    expect(out).toContain(VIBE_HOOKS_MARKER_END);
    expect(out).toContain('type = "before_tool"');
    expect(out).toContain('type = "post_agent_turn"');
    expect(out).toContain("SUPERSET_AGENT_ID=vibe");
  });
  it("preserves user hooks and is idempotent", () => {
    const user = '[[hooks]]\nname = "mine"\ntype = "after_tool"\ncommand = "echo hi"\n';
    const once = getVibeHooksTomlContent(user);
    expect(once).toContain('name = "mine"');
    // Re-running does not duplicate the managed block.
    const twice = getVibeHooksTomlContent(once);
    // Count by splitting: the marker contains regex metachars ("(do not edit)"),
    // so `new RegExp(marker)` would not match the literal text.
    expect(twice.split(VIBE_HOOKS_MARKER_START).length - 1).toBe(1);
    expect(twice).toContain('name = "mine"');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts`
Expected: FAIL (module `./agent-wrappers-vibe` not found).

- [ ] **Step 3: Implement `agent-wrappers-vibe.ts`:**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	writeFileIfChanged,
} from "./agent-wrappers-common";

export const VIBE_HOOKS_MARKER_START =
	"# >>> superset-managed-hooks v1 (do not edit) >>>";
export const VIBE_HOOKS_MARKER_END = "# <<< superset-managed-hooks v1 <<<";

/**
 * Resolve the notify script from SUPERSET_HOME_DIR at runtime (mirrors
 * getClaudeManagedHookCommand) so one shared ~/.vibe/hooks.toml works for both
 * dev and prod installs. Vibe runs the command via a shell and pipes the hook
 * invocation JSON (which carries `hook_event_name`) on stdin.
 */
const VIBE_MANAGED_HOOK_COMMAND =
	'[ -n "$SUPERSET_HOME_DIR" ] && [ -x "$SUPERSET_HOME_DIR/hooks/notify.sh" ] && SUPERSET_AGENT_ID=vibe "$SUPERSET_HOME_DIR/hooks/notify.sh" || true';

export function getVibeHooksTomlPath(): string {
	return path.join(os.homedir(), ".vibe", "hooks.toml");
}

function buildVibeManagedHooksBlock(): string {
	return [
		VIBE_HOOKS_MARKER_START,
		"[[hooks]]",
		'name = "superset-notify-before-tool"',
		'type = "before_tool"',
		`command = '${VIBE_MANAGED_HOOK_COMMAND}'`,
		"",
		"[[hooks]]",
		'name = "superset-notify-post-agent-turn"',
		'type = "post_agent_turn"',
		`command = '${VIBE_MANAGED_HOOK_COMMAND}'`,
		VIBE_HOOKS_MARKER_END,
	].join("\n");
}

/**
 * Merge our managed block into an existing hooks.toml: strip any prior managed
 * block (between markers), then append the fresh one. Preserves user hooks and
 * is idempotent — no TOML parser needed since we own the block content.
 */
export function getVibeHooksTomlContent(existing: string): string {
	let base = existing;
	const start = base.indexOf(VIBE_HOOKS_MARKER_START);
	if (start !== -1) {
		const end = base.indexOf(VIBE_HOOKS_MARKER_END, start);
		if (end !== -1) {
			base = base.slice(0, start) + base.slice(end + VIBE_HOOKS_MARKER_END.length);
		}
	}
	base = base.replace(/\s+$/, "");
	const block = buildVibeManagedHooksBlock();
	return base.length > 0 ? `${base}\n\n${block}\n` : `${block}\n`;
}

export function createVibeHooksToml(): void {
	const tomlPath = getVibeHooksTomlPath();
	const existing = fs.existsSync(tomlPath)
		? fs.readFileSync(tomlPath, "utf-8")
		: "";
	const content = getVibeHooksTomlContent(existing);
	fs.mkdirSync(path.dirname(tomlPath), { recursive: true });
	const changed = writeFileIfChanged(tomlPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Vibe hooks.toml`,
	);
}

/**
 * Wrapper for `vibe`: enables experimental hooks (so hooks.toml loads) and
 * stamps SUPERSET_AGENT_ID so the notify payload carries identity. Modeled on
 * createOpenCodeWrapper (plain export + exec — no session-log watcher).
 */
export function getVibeWrapperScript(): string {
	return buildWrapperScript(
		"vibe",
		'export VIBE_ENABLE_EXPERIMENTAL_HOOKS=true\nexec "$REAL_BIN" "$@"',
		{ agentId: "vibe" },
	);
}

export function createVibeWrapper(): void {
	createWrapper("vibe", getVibeWrapperScript());
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/lib/agent-setup/agent-wrappers-vibe.ts apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts
git commit -m "feat(desktop): add Vibe wrapper and ~/.vibe/hooks.toml notify writer"
```

### Task 3.3: Register the wrapper + hooks in the setup pipeline

**Files:**
- Modify: `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts` (barrel)
- Modify: `apps/desktop/src/main/lib/agent-setup/desktop-agent-capabilities.ts`
- Modify: `apps/desktop/src/main/lib/agent-setup/desktop-agent-setup.ts`

- [ ] **Step 1: Barrel-export** the new creators in `agent-wrappers.ts`:

```ts
export {
	createVibeHooksToml,
	createVibeWrapper,
	getVibeHooksTomlContent,
	getVibeHooksTomlPath,
	getVibeWrapperScript,
	VIBE_HOOKS_MARKER_END,
	VIBE_HOOKS_MARKER_START,
} from "./agent-wrappers-vibe";
```

- [ ] **Step 2: Add action slugs** to `DESKTOP_AGENT_SETUP_ACTIONS` in `desktop-agent-capabilities.ts`:

```ts
	"vibe-hooks-toml",
	"vibe-wrapper",
```

- [ ] **Step 3: Add the target** to `DESKTOP_AGENT_SETUP_TARGETS` (after the `copilot` entry):

```ts
	{
		id: "vibe",
		setupActions: ["vibe-hooks-toml", "vibe-wrapper"],
		managedBinary: true,
	},
```

- [ ] **Step 4: Map the runners** in `desktop-agent-setup.ts` — import `createVibeHooksToml, createVibeWrapper` from `./agent-wrappers`, then add to `DESKTOP_AGENT_SETUP_RUNNERS`:

```ts
		"vibe-hooks-toml": createVibeHooksToml,
		"vibe-wrapper": createVibeWrapper,
```

- [ ] **Step 5: Verify typecheck** (the runners `Record` is typed against the actions union — a mismatch is a compile error):

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts apps/desktop/src/main/lib/agent-setup/desktop-agent-capabilities.ts apps/desktop/src/main/lib/agent-setup/desktop-agent-setup.ts
git commit -m "feat(desktop): wire Vibe into the agent-setup hook/wrapper pipeline"
```

### Task 3.4: Chunk 3 quality gate

- [ ] `bun run lint:fix && bun run lint` → 0 output.
- [ ] `bun run typecheck` → PASS.
- [ ] `bun test packages/host-service/src/events/map-event-type.test.ts apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts` → PASS.
- [ ] Commit any lint changes.

---

## Chunk 4: Polish (search, docs, marketing)

Outcome: Vibe is discoverable in Settings search and documented; optional marketing surfaces. All non-load-bearing — trimmable if scope tightens.

### Task 4.1: Settings search keywords

**Files:**
- Modify: `apps/desktop/.../settings-search/settings-search.ts`

- [ ] **Step 1:** Add `"vibe"` and `"mistral"` to the agent keyword arrays (`AGENTS_COMMANDS` ~lines 659-666 and `TERMINAL_QUICK_ADD` ~lines 713-718). Match the existing single-string-per-line style.
- [ ] **Step 2:** `bun run typecheck` → PASS.
- [ ] **Step 3:** Commit: `git commit -am "feat(desktop): surface Mistral Vibe in settings search"`.

### Task 4.2: AGENTS.md compatibility note

**Files:**
- Modify: root `AGENTS.md`

- [ ] **Step 1:** Under the agent-compatibility rules (#3/#4), add a short note: Mistral Vibe reads `AGENTS.md` + `.agents/skills/` natively (trust granted via `--trust`; no `.agents/commands` support), configures via TOML at `.vibe/config.toml`, and consumes MCP as `[[mcp_servers]]` TOML (not `.mcp.json`).
- [ ] **Step 2:** Commit: `git commit -am "docs(agents): note Mistral Vibe config/skills conventions"`.

### Task 4.3 (optional): Marketing + docs surfaces

**Files:** `apps/marketing/src/app/components/FeaturesSection/components/UniversalCompatibilityDemo/UniversalCompatibilityDemo.tsx`, `apps/marketing/src/app/components/HeroSection/components/AppMockup/constants.ts` (+ `apps/marketing/public/app-icons/vibe.svg`), `apps/docs/content/docs/mcp.mdx` + `terminal-presets.mdx`, `apps/mobile/store.config.json`.

- [ ] **Step 1:** Add Mistral Vibe to the marketing agent lists (with a `vibe.svg` in `apps/marketing/public/app-icons/`), the docs agent/preset/MCP enumerations, and the mobile store keywords. Mirror existing entries.
- [ ] **Step 2:** `bun run lint && bun run typecheck` → PASS.
- [ ] **Step 3:** Commit: `git commit -am "docs(marketing): include Mistral Vibe in compatibility surfaces"`.

### Task 4.4: Final quality gate

- [ ] `bun run lint:fix && bun run lint` → 0 output.
- [ ] `bun run typecheck` → PASS.
- [ ] `bun test packages/shared packages/host-service apps/desktop` (or the affected suites) → PASS.

---

## Manual smoke test (from the spec)

1. `vibe` installed + `MISTRAL_API_KEY` set. Start the desktop app (`bun dev`).
2. New workspace → agent picker shows **Mistral Vibe** with its icon; select it, pick a model.
3. Launch with a task prompt → pane runs `VIBE_ACTIVE_MODEL=<model> vibe --trust --auto-approve '<prompt>'`; the TUI starts working.
4. Working indicator lights on first tool call; completion chime fires once at idle (`post_agent_turn`); indicator clears.
5. Vibe picks up the repo `AGENTS.md` + `.agents/skills/` (trust via `--trust`).
6. Move `vibe` off PATH → launching shows the wrapper's "not found in PATH, install it" message (exit 127), no crash.

## Notes for the implementer

- **Do NOT modify the Mistral Vibe repo** (`/Users/drake.thomsen/Documents/code-projects/mistral-vibe`) — reference only. No Vibe change is required for this plan.
- The two optional upstream Vibe enhancements (a prompt-submitted/turn-start hook for an immediate working indicator; a permission-requested hook for approvals-on mode) are out of scope — see the spec.
- PR title must be a conventional commit with scope (AGENTS.md #10), e.g. `feat(desktop): add first-class Mistral Vibe coding agent`.
