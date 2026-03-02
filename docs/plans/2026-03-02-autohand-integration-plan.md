# Autohand CLI Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full native support for Autohand Code CLI to Superset with feature parity to existing agents (Codex, Gemini, Mastra).

**Architecture:** Config-based hooks written to `~/.autohand/config.json` (matching Autohand's `HooksSettings` format), exec-passthrough shell wrapper, shell shim, SVG icons, UI preset, and project-level MCP config at `.autohand/config.json`.

**Tech Stack:** TypeScript, Bun, SVG, shell scripting

---

### Task 1: Add autohand agent type to shared package

**Files:**
- Modify: `packages/shared/src/agent-command.ts`

**Step 1: Add "autohand" to AGENT_TYPES array (line 1-8)**

In `AGENT_TYPES`, add `"autohand"` after `"cursor-agent"`:

```typescript
export const AGENT_TYPES = [
	"claude",
	"codex",
	"gemini",
	"opencode",
	"copilot",
	"cursor-agent",
	"autohand",
] as const;
```

**Step 2: Add autohand to AGENT_LABELS (line 12-19)**

```typescript
export const AGENT_LABELS: Record<AgentType, string> = {
	claude: "Claude",
	codex: "Codex",
	gemini: "Gemini",
	opencode: "OpenCode",
	copilot: "Copilot",
	"cursor-agent": "Cursor Agent",
	autohand: "Autohand",
};
```

**Step 3: Add autohand to AGENT_PRESET_COMMANDS (line 21-30)**

```typescript
export const AGENT_PRESET_COMMANDS: Record<AgentType, string[]> = {
	claude: ["claude --dangerously-skip-permissions"],
	codex: [
		'codex -c model_reasoning_effort="high" --ask-for-approval never --sandbox danger-full-access -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true',
	],
	gemini: ["gemini --yolo"],
	opencode: ["opencode"],
	copilot: ["copilot --allow-all"],
	"cursor-agent": ["cursor-agent"],
	autohand: ["autohand --unrestricted"],
};
```

**Step 4: Add autohand to AGENT_PRESET_DESCRIPTIONS (line 32-39)**

```typescript
export const AGENT_PRESET_DESCRIPTIONS: Record<AgentType, string> = {
	claude: "Danger mode: All permissions auto-approved",
	codex: "Danger mode: All permissions auto-approved",
	gemini: "Danger mode: All permissions auto-approved",
	opencode: "OpenCode: Open-source AI coding agent",
	copilot: "Danger mode: All permissions auto-approved",
	"cursor-agent": "Cursor AI agent for terminal-based coding assistance",
	autohand: "Danger mode: All permissions auto-approved",
};
```

**Step 5: Add autohand to AGENT_COMMANDS builder (line 98-118)**

```typescript
const AGENT_COMMANDS: Record<
	AgentType,
	(prompt: string, delimiter: string) => string
> = {
	claude: (prompt, delimiter) =>
		buildHeredoc(prompt, delimiter, "claude --dangerously-skip-permissions"),
	codex: (prompt, delimiter) =>
		buildHeredoc(
			prompt,
			delimiter,
			'codex -c model_reasoning_effort="high" --ask-for-approval never --sandbox danger-full-access --',
		),
	gemini: (prompt, delimiter) =>
		buildHeredoc(prompt, delimiter, "gemini --yolo"),
	opencode: (prompt, delimiter) =>
		buildHeredoc(prompt, delimiter, "opencode --prompt"),
	copilot: (prompt, delimiter) =>
		buildHeredoc(prompt, delimiter, "copilot -i", "--yolo"),
	"cursor-agent": (prompt, delimiter) =>
		buildHeredoc(prompt, delimiter, "cursor-agent --yolo"),
	autohand: (prompt, delimiter) =>
		buildHeredoc(prompt, delimiter, "autohand --unrestricted -p"),
};
```

**Step 6: Commit**

```bash
git add packages/shared/src/agent-command.ts
git commit -m "feat: add autohand agent type to shared package"
```

---

### Task 2: Create autohand hook config writer and wrapper

**Files:**
- Create: `apps/desktop/src/main/lib/agent-setup/agent-wrappers-autohand.ts`

**Step 1: Create the autohand wrappers module**

This follows the Mastra pattern. Autohand stores hooks in `~/.autohand/config.json` under `hooks.hooks[]` array with `event`, `command`, `enabled` fields.

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	isSupersetManagedHookCommand,
	writeFileIfChanged,
} from "./agent-wrappers-common";
import { getNotifyScriptPath, NOTIFY_SCRIPT_NAME } from "./notify-hook";

interface AutohandHookDefinition {
	event: string;
	command: string;
	enabled?: boolean;
	description?: string;
	[key: string]: unknown;
}

interface AutohandHooksSettings {
	enabled?: boolean;
	hooks?: AutohandHookDefinition[];
}

interface AutohandConfigJson {
	hooks?: AutohandHooksSettings;
	[key: string]: unknown;
}

function quoteShellPath(filePath: string): string {
	return `'${filePath.replaceAll("'", "'\\''")}'`;
}

export function getAutohandGlobalConfigPath(): string {
	return path.join(
		process.env.AUTOHAND_HOME || path.join(os.homedir(), ".autohand"),
		"config.json",
	);
}

export function createAutohandWrapper(): void {
	const script = buildWrapperScript("autohand", `exec "$REAL_BIN" "$@"`);
	createWrapper("autohand", script);
}

/**
 * Reads existing ~/.autohand/config.json, merges our hook entries (identified
 * by notify script path), and preserves all other config settings.
 *
 * Autohand stores hooks as:
 *   { hooks: { enabled: true, hooks: [{ event, command, enabled }] } }
 */
export function getAutohandHooksConfigContent(
	notifyScriptPath: string,
): string {
	const globalPath = getAutohandGlobalConfigPath();

	let existing: AutohandConfigJson = {};
	try {
		if (fs.existsSync(globalPath)) {
			existing = JSON.parse(fs.readFileSync(globalPath, "utf-8"));
		}
	} catch {
		console.warn(
			"[agent-setup] Could not parse existing ~/.autohand/config.json, merging carefully",
		);
	}

	if (!existing.hooks || typeof existing.hooks !== "object") {
		existing.hooks = { enabled: true, hooks: [] };
	}
	if (!Array.isArray(existing.hooks.hooks)) {
		existing.hooks.hooks = [];
	}

	// Ensure hooks are globally enabled
	existing.hooks.enabled = true;

	const notifyCommand = `bash ${quoteShellPath(notifyScriptPath)}`;
	const managedEvents = ["pre-prompt", "stop", "post-tool"] as const;

	// Filter out stale Superset hook entries, then add fresh ones
	const filtered = existing.hooks.hooks.filter(
		(entry: AutohandHookDefinition) =>
			!managedEvents.includes(entry.event as (typeof managedEvents)[number]) ||
			!(
				entry.command?.includes(notifyScriptPath) ||
				isSupersetManagedHookCommand(entry.command, NOTIFY_SCRIPT_NAME)
			),
	);

	for (const event of managedEvents) {
		// Remove any existing Superset-managed hooks for this event
		const withoutStale = filtered.filter(
			(entry: AutohandHookDefinition) =>
				entry.event !== event ||
				!(
					entry.command?.includes(notifyScriptPath) ||
					isSupersetManagedHookCommand(entry.command, NOTIFY_SCRIPT_NAME)
				),
		);
		filtered.length = 0;
		filtered.push(...withoutStale);

		filtered.push({
			event,
			command: notifyCommand,
			enabled: true,
		});
	}

	existing.hooks.hooks = filtered;

	return JSON.stringify(existing, null, 2);
}

export function createAutohandHooksConfig(): void {
	const notifyScriptPath = getNotifyScriptPath();
	const globalPath = getAutohandGlobalConfigPath();
	const content = getAutohandHooksConfigContent(notifyScriptPath);

	const dir = path.dirname(globalPath);
	fs.mkdirSync(dir, { recursive: true });
	const changed = writeFileIfChanged(globalPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Autohand config.json`,
	);
}
```

**Step 2: Commit**

```bash
git add apps/desktop/src/main/lib/agent-setup/agent-wrappers-autohand.ts
git commit -m "feat: create autohand hook config writer and wrapper"
```

---

### Task 3: Wire up autohand in barrel exports, agent-setup index, and shell shims

**Files:**
- Modify: `apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts`
- Modify: `apps/desktop/src/main/lib/agent-setup/index.ts`
- Modify: `apps/desktop/src/main/lib/agent-setup/shell-wrappers.ts`

**Step 1: Add autohand exports to agent-wrappers.ts barrel**

Append to the end of `agent-wrappers.ts`:

```typescript
export {
	createAutohandHooksConfig,
	createAutohandWrapper,
	getAutohandGlobalConfigPath,
	getAutohandHooksConfigContent,
} from "./agent-wrappers-autohand";
```

**Step 2: Add autohand to setupAgentHooks in index.ts**

Import `createAutohandWrapper` and `createAutohandHooksConfig` from `"./agent-wrappers"`, then add calls inside `setupAgentHooks()` (after `createCopilotWrapper()`, before `createZshWrapper()`):

```typescript
createAutohandWrapper();
createAutohandHooksConfig();
```

The import line in index.ts should be updated to include the new exports.

**Step 3: Add "autohand" to SHIMMED_BINARIES in shell-wrappers.ts (line 49-56)**

```typescript
const SHIMMED_BINARIES = [
	"claude",
	"codex",
	"opencode",
	"gemini",
	"copilot",
	"mastracode",
	"autohand",
];
```

**Step 4: Commit**

```bash
git add apps/desktop/src/main/lib/agent-setup/agent-wrappers.ts \
       apps/desktop/src/main/lib/agent-setup/index.ts \
       apps/desktop/src/main/lib/agent-setup/shell-wrappers.ts
git commit -m "feat: wire autohand into agent-setup and shell shims"
```

---

### Task 4: Add autohand SVG icons and register in preset-icons

**Files:**
- Create: `packages/ui/src/assets/icons/preset-icons/autohand.svg`
- Create: `packages/ui/src/assets/icons/preset-icons/autohand-white.svg`
- Modify: `packages/ui/src/assets/icons/preset-icons/index.ts`

**Step 1: Create autohand.svg (dark icon for light backgrounds)**

Create an SVG icon representing Autohand's brand — a stylized "A" with a hand motif, consistent with the Autohand icon (blue circle with white "A"). For the preset icon, use a simplified version without the circle background, just the "A" glyph in black fill.

SVG at `packages/ui/src/assets/icons/preset-icons/autohand.svg`:

```svg
<svg width="721" height="721" viewBox="0 0 721 721" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M360.5 120C340.2 120 322.1 132.4 315.1 151.3L168.7 546.7C163.5 560.8 173.9 576 189.1 576H234.5C248.3 576 260.5 567.8 265.2 554.8L293.8 476H427.2L455.8 554.8C460.5 567.8 472.7 576 486.5 576H531.9C547.1 576 557.5 560.8 552.3 546.7L405.9 151.3C398.9 132.4 380.8 120 360.5 120ZM316.7 406L360.5 287.5L404.3 406H316.7Z" fill="black"/>
  <path d="M360.5 620C399.3 620 431.5 608 456.5 584L472.5 600C500 576 520 544 520 504H440C440 528 420 548 396 560L360.5 576L325 560C301 548 281 528 281 504H201C201 544 221 576 248.5 600L264.5 584C289.5 608 321.7 620 360.5 620Z" fill="black" opacity="0.3"/>
</svg>
```

**Step 2: Create autohand-white.svg (light icon for dark backgrounds)**

Same paths but with `fill="white"`.

**Step 3: Register icons in index.ts**

Add imports and register in `PRESET_ICONS`:

```typescript
import autohandIcon from "./autohand.svg";
import autohandWhiteIcon from "./autohand-white.svg";

// In PRESET_ICONS:
autohand: { light: autohandIcon, dark: autohandWhiteIcon },

// In exports:
export { autohandIcon, autohandWhiteIcon };
```

**Step 4: Commit**

```bash
git add packages/ui/src/assets/icons/preset-icons/autohand.svg \
       packages/ui/src/assets/icons/preset-icons/autohand-white.svg \
       packages/ui/src/assets/icons/preset-icons/index.ts
git commit -m "feat: add autohand SVG icons to preset-icons"
```

---

### Task 5: Add autohand to default presets in settings router

**Files:**
- Modify: `apps/desktop/src/lib/trpc/routers/settings/index.ts`

**Step 1: Add "autohand" to DEFAULT_PRESET_AGENTS (line 92-98)**

```typescript
const DEFAULT_PRESET_AGENTS = [
	"claude",
	"codex",
	"copilot",
	"opencode",
	"gemini",
	"autohand",
] as const;
```

**Step 2: Commit**

```bash
git add apps/desktop/src/lib/trpc/routers/settings/index.ts
git commit -m "feat: add autohand to default terminal presets"
```

---

### Task 6: Add project-level MCP config and commands symlink

**Files:**
- Create: `.autohand/config.json` (project-level MCP config)
- Create: `.autohand/commands` (symlink to `../.agents/commands`)
- Modify: `.gitignore`

**Step 1: Create .autohand/config.json with MCP servers**

```json
{
  "mcp": {
    "servers": [
      {
        "name": "superset",
        "transport": "http",
        "url": "https://api.superset.sh/api/agent/mcp"
      },
      {
        "name": "expo-mcp",
        "transport": "http",
        "url": "https://mcp.expo.dev/mcp",
        "enabled": false
      },
      {
        "name": "maestro",
        "transport": "stdio",
        "command": "maestro",
        "args": ["mcp"]
      },
      {
        "name": "neon",
        "transport": "http",
        "url": "https://mcp.neon.tech/mcp"
      },
      {
        "name": "linear",
        "transport": "http",
        "url": "https://mcp.linear.app/mcp"
      },
      {
        "name": "sentry",
        "transport": "http",
        "url": "https://mcp.sentry.dev/mcp"
      },
      {
        "name": "desktop-automation",
        "transport": "stdio",
        "command": "bun",
        "args": ["run", "packages/desktop-mcp/src/bin.ts"]
      }
    ]
  }
}
```

**Step 2: Create commands symlink**

```bash
cd superset && ln -s ../.agents/commands .autohand/commands
```

**Step 3: Add .autohand gitignore rules to .gitignore**

Append after the .codex section (line 85):

```gitignore
# Autohand workspace config (track only shared config/symlinks; ignore runtime state)
.autohand/*
!.autohand/config.json
!.autohand/commands
```

**Step 4: Commit**

```bash
git add .autohand/config.json .autohand/commands .gitignore
git commit -m "feat: add autohand project-level MCP config and commands"
```

---

### Task 7: Add tests for autohand integration

**Files:**
- Modify: `apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts`

**Step 1: Import autohand functions in test file**

In the dynamic import block (around line 58-68), add:

```typescript
const {
	buildCodexWrapperExecLine,
	buildCopilotWrapperExecLine,
	buildWrapperScript,
	createCodexWrapper,
	createAutohandWrapper,
	getAutohandHooksConfigContent,
	createMastraWrapper,
	getCursorHooksJsonContent,
	getCopilotHookScriptPath,
	getGeminiSettingsJsonContent,
	getMastraHooksJsonContent,
} = await import("./agent-wrappers");
```

**Step 2: Add test for autohand hook merge logic**

```typescript
it("replaces stale Autohand hook commands from old superset paths", () => {
	const autohandConfigDir = path.join(mockedHomeDir, ".autohand");
	const autohandConfigPath = path.join(autohandConfigDir, "config.json");
	const staleHookPath = "/tmp/.superset-old/hooks/notify.sh";
	const currentHookPath = "/tmp/.superset-new/hooks/notify.sh";

	mkdirSync(autohandConfigDir, { recursive: true });
	writeFileSync(
		autohandConfigPath,
		JSON.stringify(
			{
				provider: "openrouter",
				hooks: {
					enabled: true,
					hooks: [
						{
							event: "pre-prompt",
							command: `bash '${staleHookPath}'`,
							enabled: true,
						},
						{
							event: "stop",
							command: `bash '${staleHookPath}'`,
							enabled: true,
						},
						{
							event: "post-tool",
							command: `bash '${staleHookPath}'`,
							enabled: true,
						},
						{
							event: "session-start",
							command: "/usr/local/bin/custom-hook",
							enabled: true,
						},
					],
				},
			},
			null,
			2,
		),
	);

	const content = getAutohandHooksConfigContent(currentHookPath);
	writeFileSync(autohandConfigPath, content);
	const content2 = getAutohandHooksConfigContent(currentHookPath);

	const parsed = JSON.parse(content) as AutohandConfigJson;
	const managedEvents = ["pre-prompt", "stop", "post-tool"] as const;

	// Verify provider config is preserved
	expect(parsed.provider).toBe("openrouter");

	// Verify hooks are enabled
	expect(parsed.hooks?.enabled).toBe(true);

	const hooks = parsed.hooks?.hooks ?? [];

	for (const eventName of managedEvents) {
		const eventHooks = hooks.filter(
			(h: { event: string }) => h.event === eventName,
		);
		expect(eventHooks.length).toBe(1);
		expect(eventHooks[0].command).toBe(`bash '${currentHookPath}'`);
		expect(eventHooks[0].enabled).toBe(true);
		// Verify stale path is gone
		expect(
			eventHooks.some((h: { command: string }) =>
				h.command.includes(staleHookPath),
			),
		).toBe(false);
	}

	// Verify user-defined hooks are preserved
	const customHooks = hooks.filter(
		(h: { event: string }) => h.event === "session-start",
	);
	expect(customHooks.length).toBe(1);
	expect(customHooks[0].command).toBe("/usr/local/bin/custom-hook");

	// Idempotency check
	expect(JSON.parse(content2)).toEqual(JSON.parse(content));
});
```

**Step 3: Add test for autohand wrapper creation**

```typescript
it("creates autohand wrapper passthrough", () => {
	createAutohandWrapper();

	const wrapperPath = path.join(TEST_BIN_DIR, "autohand");
	const wrapper = readFileSync(wrapperPath, "utf-8");

	expect(wrapper).toContain("# Superset wrapper for autohand");
	expect(wrapper).toContain('REAL_BIN="$(find_real_binary "autohand")"');
	expect(wrapper).toContain('exec "$REAL_BIN" "$@"');
});
```

**Step 4: Run the tests**

```bash
cd apps/desktop && bun test src/main/lib/agent-setup/agent-wrappers.test.ts
```

Expected: All existing tests pass, plus the 2 new autohand tests.

**Step 5: Commit**

```bash
git add apps/desktop/src/main/lib/agent-setup/agent-wrappers.test.ts
git commit -m "test: add autohand integration tests"
```

---

### Task 8: Update AGENTS.md with autohand config instructions

**Files:**
- Modify: `AGENTS.md`

**Step 1: Add autohand to Agent Rules section**

In the "Agent Rules" section (item 4 about workspace MCP config), add autohand reference:

> Autohand uses `.autohand/config.json` at the project root (run with `autohand --config .autohand/config.json` or from the project directory).

**Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add autohand config instructions to AGENTS.md"
```
