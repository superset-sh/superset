import fs from "node:fs";
import path from "node:path";
import { BIN_DIR, HOOKS_DIR } from "./paths";
import { findRealBinary } from "./utils";

/**
 * Creates the Claude Code settings JSON file with notification hooks
 */
function createClaudeSettings(): string {
	const settingsPath = path.join(HOOKS_DIR, "claude-settings.json");
	const notifyPath = path.join(HOOKS_DIR, "notify.sh");

	const settings = {
		hooks: {
			Stop: [{ hooks: [{ type: "command", command: notifyPath }] }],
			PermissionRequest: [
				{ matcher: "*", hooks: [{ type: "command", command: notifyPath }] },
			],
		},
	};

	fs.writeFileSync(settingsPath, JSON.stringify(settings), { mode: 0o644 });
	return settingsPath;
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
