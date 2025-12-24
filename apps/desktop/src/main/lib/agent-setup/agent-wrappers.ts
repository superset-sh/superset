import fs from "node:fs";
import path from "node:path";
import { BIN_DIR, HOOKS_DIR } from "./paths";
import { findRealBinary } from "./utils";

export type ClaudeTheme = "dark" | "light";

/** Current theme stored in memory for building settings */
let currentTheme: ClaudeTheme = "dark";

/**
 * Gets the path to the Claude settings file
 */
export function getClaudeSettingsPath(): string {
	return path.join(HOOKS_DIR, "claude-settings.json");
}

/**
 * Builds the Claude Code settings object with notification hooks and theme
 */
function buildClaudeSettings(): object {
	const notifyPath = path.join(HOOKS_DIR, "notify.sh");

	return {
		hooks: {
			Stop: [{ hooks: [{ type: "command", command: notifyPath }] }],
			PermissionRequest: [
				{ matcher: "*", hooks: [{ type: "command", command: notifyPath }] },
			],
		},
		preferences: {
			theme: currentTheme,
		},
	};
}

/**
 * Creates the Claude Code settings JSON file with notification hooks
 */
function createClaudeSettings(): string {
	const settingsPath = getClaudeSettingsPath();
	const settings = buildClaudeSettings();

	fs.writeFileSync(settingsPath, JSON.stringify(settings), { mode: 0o644 });
	return settingsPath;
}

/**
 * Updates the Claude Code settings with a new theme
 * Called when the app theme changes
 */
export function updateClaudeSettingsTheme(theme: ClaudeTheme): void {
	currentTheme = theme;
	const settingsPath = getClaudeSettingsPath();

	// Only update if settings file exists (wrapper was created)
	if (fs.existsSync(settingsPath)) {
		const settings = buildClaudeSettings();
		fs.writeFileSync(settingsPath, JSON.stringify(settings), { mode: 0o644 });
		console.log(`[agent-setup] Updated Claude settings theme to ${theme}`);
	}
}

/**
 * Creates wrapper script for Claude Code
 */
export function createClaudeWrapper(): void {
	const wrapperPath = path.join(BIN_DIR, "claude");
	const realClaude = findRealBinary("claude");

	if (!realClaude) {
		console.log("[agent-setup] Claude not found, skipping wrapper");
		return;
	}

	const settingsPath = createClaudeSettings();

	const script = `#!/bin/bash
# Superset wrapper for Claude Code
# Injects notification hook settings

exec "${realClaude}" --settings "${settingsPath}" "$@"
`;
	fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
	console.log(`[agent-setup] Created Claude wrapper -> ${realClaude}`);
}

/**
 * Creates wrapper script for Codex
 */
export function createCodexWrapper(): void {
	const wrapperPath = path.join(BIN_DIR, "codex");
	const realCodex = findRealBinary("codex");

	if (!realCodex) {
		console.log("[agent-setup] Codex not found, skipping wrapper");
		return;
	}

	const notifyPath = path.join(HOOKS_DIR, "notify.sh");
	const script = `#!/bin/bash
# Superset wrapper for Codex
# Injects notification hook settings

exec "${realCodex}" -c 'notify=["bash","${notifyPath}"]' "$@"
`;
	fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
	console.log(`[agent-setup] Created Codex wrapper -> ${realCodex}`);
}
