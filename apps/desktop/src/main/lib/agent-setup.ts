import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
	NOTIFICATIONS_PORT,
	SUPERSET_DIR_NAME,
	SUPERSET_HOME_DIR,
} from "./app-environment";

const BIN_DIR = path.join(SUPERSET_HOME_DIR, "bin");
const HOOKS_DIR = path.join(SUPERSET_HOME_DIR, "hooks");

/**
 * Finds the real path of a binary, skipping our wrapper scripts
 */
function findRealBinary(name: string): string | null {
	try {
		// Get all paths, filter out our bin dir
		const result = execSync(`which -a ${name} 2>/dev/null || true`, {
			encoding: "utf-8",
		});
		const paths = result
			.trim()
			.split("\n")
			.filter((p) => p && !p.startsWith(BIN_DIR));
		return paths[0] || null;
	} catch {
		return null;
	}
}

/**
 * Creates the notify.sh script
 */
function createNotifyScript(): void {
	const notifyPath = path.join(HOOKS_DIR, "notify.sh");
	const script = `#!/bin/bash
# Superset agent notification hook
# Called by CLI agents (Claude Code, Codex, etc.) when they complete

# Only run if inside a Superset terminal
[ -z "$SUPERSET_TAB_ID" ] && exit 0

curl -sG "http://127.0.0.1:\${SUPERSET_PORT:-${NOTIFICATIONS_PORT}}/hook/complete" \\
  --data-urlencode "tabId=$SUPERSET_TAB_ID" \\
  --data-urlencode "tabTitle=$SUPERSET_TAB_TITLE" \\
  --data-urlencode "workspaceName=$SUPERSET_WORKSPACE_NAME" \\
  --data-urlencode "workspaceId=$SUPERSET_WORKSPACE_ID" \\
  > /dev/null 2>&1
`;
	fs.writeFileSync(notifyPath, script, { mode: 0o755 });
}

/**
 * Creates wrapper script for Claude Code
 */
function createClaudeWrapper(): void {
	const wrapperPath = path.join(BIN_DIR, "claude");
	const realClaude = findRealBinary("claude");

	if (!realClaude) {
		console.log("[agent-setup] Claude not found, skipping wrapper");
		return;
	}

	const script = `#!/bin/bash
# Superset wrapper for Claude Code
# Injects notification hook settings

SUPERSET_CLAUDE_SETTINGS='{"hooks":{"Stop":[{"matcher":"","hooks":[{"type":"command","command":"~/${SUPERSET_DIR_NAME}/hooks/notify.sh"}]}]}}'

exec "${realClaude}" --settings "$SUPERSET_CLAUDE_SETTINGS" "$@"
`;
	fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
	console.log(`[agent-setup] Created Claude wrapper -> ${realClaude}`);
}

/**
 * Creates wrapper script for Codex
 */
function createCodexWrapper(): void {
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

/**
 * Sets up the ~/.superset directory structure and agent wrappers
 * Called on app startup
 */
export function setupAgentHooks(): void {
	console.log("[agent-setup] Initializing agent hooks...");

	// Create directories
	fs.mkdirSync(BIN_DIR, { recursive: true });
	fs.mkdirSync(HOOKS_DIR, { recursive: true });

	// Create scripts
	createNotifyScript();
	createClaudeWrapper();
	createCodexWrapper();

	console.log("[agent-setup] Agent hooks initialized");
}

/**
 * Returns the PATH with our bin directory prepended
 */
export function getSupersetPath(): string {
	return `${BIN_DIR}:${process.env.PATH || ""}`;
}

/**
 * Returns the bin directory path
 */
export function getSupersetBinDir(): string {
	return BIN_DIR;
}
