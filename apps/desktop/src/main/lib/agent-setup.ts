import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PORTS, SUPERSET_DIR_NAME, SUPERSET_DIR_NAMES } from "shared/constants";
import { SUPERSET_HOME_DIR } from "./app-environment";

const BIN_DIR = path.join(SUPERSET_HOME_DIR, "bin");
const HOOKS_DIR = path.join(SUPERSET_HOME_DIR, "hooks");
const ZSH_DIR = path.join(SUPERSET_HOME_DIR, "zsh");
const BASH_DIR = path.join(SUPERSET_HOME_DIR, "bash");

/**
 * Finds the real path of a binary, skipping our wrapper scripts.
 * Filters out both dev and prod superset bin directories
 * to avoid wrapper scripts calling each other.
 */
function findRealBinary(name: string): string | null {
	try {
		const result = execSync(`which -a ${name} 2>/dev/null || true`, {
			encoding: "utf-8",
		});
		const homedir = os.homedir();
		const supersetBinDirs = [
			path.join(homedir, SUPERSET_DIR_NAMES.PROD, "bin"),
			path.join(homedir, SUPERSET_DIR_NAMES.DEV, "bin"),
		];
		const paths = result
			.trim()
			.split("\n")
			.filter((p) => p && !supersetBinDirs.some((dir) => p.startsWith(dir)));
		return paths[0] || null;
	} catch {
		return null;
	}
}

function createNotifyScript(): void {
	const notifyPath = path.join(HOOKS_DIR, "notify.sh");
	const script = `#!/bin/bash
# Superset agent notification hook
# Called by CLI agents (Claude Code, Codex, etc.) when they complete or need input

# Only run if inside a Superset terminal
[ -z "$SUPERSET_TAB_ID" ] && exit 0

# Get JSON input - Codex passes as argument, Claude pipes to stdin
if [ -n "$1" ]; then
  INPUT="$1"
else
  INPUT=$(cat)
fi

# Extract event type - Claude uses "hook_event_name", Codex uses "type"
EVENT_TYPE=$(echo "$INPUT" | grep -o '"hook_event_name":"[^"]*"' | cut -d'"' -f4)
if [ -z "$EVENT_TYPE" ]; then
  # Check for Codex "type" field (e.g., "agent-turn-complete")
  CODEX_TYPE=$(echo "$INPUT" | grep -o '"type":"[^"]*"' | cut -d'"' -f4)
  if [ "$CODEX_TYPE" = "agent-turn-complete" ]; then
    EVENT_TYPE="Stop"
  fi
fi

# Default to "Stop" if not found
[ -z "$EVENT_TYPE" ] && EVENT_TYPE="Stop"

curl -sG "http://127.0.0.1:\${SUPERSET_PORT:-${PORTS.NOTIFICATIONS}}/hook/complete" \\
  --data-urlencode "paneId=$SUPERSET_PANE_ID" \\
  --data-urlencode "tabId=$SUPERSET_TAB_ID" \\
  --data-urlencode "workspaceId=$SUPERSET_WORKSPACE_ID" \\
  --data-urlencode "eventType=$EVENT_TYPE" \\
  > /dev/null 2>&1
`;
	fs.writeFileSync(notifyPath, script, { mode: 0o755 });
}

function createClaudeWrapper(): void {
	const wrapperPath = path.join(BIN_DIR, "claude");
	const realClaude = findRealBinary("claude");

	if (!realClaude) {
		console.log("[agent-setup] Claude not found, skipping wrapper");
		return;
	}

	// Use $HOME instead of ~ because tilde doesn't expand inside JSON strings.
	// Using ~ causes Claude Code's file watcher to malfunction and watch TMPDIR.
	const script = `#!/bin/bash
# Superset wrapper for Claude Code
# Injects notification hook settings

NOTIFY_SCRIPT="$HOME/${SUPERSET_DIR_NAME}/hooks/notify.sh"
SUPERSET_CLAUDE_SETTINGS="{\\"hooks\\":{\\"Stop\\":[{\\"hooks\\":[{\\"type\\":\\"command\\",\\"command\\":\\"$NOTIFY_SCRIPT\\"}]}],\\"PermissionRequest\\":[{\\"matcher\\":\\"*\\",\\"hooks\\":[{\\"type\\":\\"command\\",\\"command\\":\\"$NOTIFY_SCRIPT\\"}]}]}}"

exec "${realClaude}" --settings "$SUPERSET_CLAUDE_SETTINGS" "$@"
`;
	fs.writeFileSync(wrapperPath, script, { mode: 0o755 });
	console.log(`[agent-setup] Created Claude wrapper -> ${realClaude}`);
}

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
 * Creates zsh initialization wrapper that intercepts shell startup
 * Sources user's real shell config files then prepends our bin to PATH
 */
function createZshWrapper(): void {
	// Create .zprofile to source user's .zprofile (runs for login shells before .zshrc)
	// This is critical - without it, brew/nvm PATH setup in ~/.zprofile is skipped
	// Don't change ZDOTDIR here - we need our .zshrc to run after this
	const zprofilePath = path.join(ZSH_DIR, ".zprofile");
	const zprofileScript = `# Superset zsh profile wrapper
_superset_home="\${SUPERSET_ORIG_ZDOTDIR:-$HOME}"
[[ -f "$_superset_home/.zprofile" ]] && source "$_superset_home/.zprofile"
`;
	fs.writeFileSync(zprofilePath, zprofileScript, { mode: 0o644 });

	// Create .zshrc - reset ZDOTDIR before sourcing so Oh My Zsh works correctly
	const zshrcPath = path.join(ZSH_DIR, ".zshrc");
	const zshrcScript = `# Superset zsh rc wrapper
_superset_home="\${SUPERSET_ORIG_ZDOTDIR:-$HOME}"
export ZDOTDIR="$_superset_home"
[[ -f "$_superset_home/.zshrc" ]] && source "$_superset_home/.zshrc"
export PATH="$HOME/${SUPERSET_DIR_NAME}/bin:$PATH"
`;
	fs.writeFileSync(zshrcPath, zshrcScript, { mode: 0o644 });
	console.log("[agent-setup] Created zsh wrapper");
}

function createBashWrapper(): void {
	const rcfilePath = path.join(BASH_DIR, "rcfile");
	const script = `# Superset bash rcfile wrapper

# Source system profile
[[ -f /etc/profile ]] && source /etc/profile

# Source user's login profile
if [[ -f "$HOME/.bash_profile" ]]; then
  source "$HOME/.bash_profile"
elif [[ -f "$HOME/.bash_login" ]]; then
  source "$HOME/.bash_login"
elif [[ -f "$HOME/.profile" ]]; then
  source "$HOME/.profile"
fi

# Source bashrc if separate
[[ -f "$HOME/.bashrc" ]] && source "$HOME/.bashrc"

# Prepend superset bin to PATH
export PATH="$HOME/${SUPERSET_DIR_NAME}/bin:$PATH"
# Minimal prompt (path/env shown in toolbar) - emerald to match app theme
export PS1=$'\\[\\e[1;38;2;52;211;153m\\]❯\\[\\e[0m\\] '
`;
	fs.writeFileSync(rcfilePath, script, { mode: 0o644 });
	console.log("[agent-setup] Created bash wrapper");
}

export function setupAgentHooks(): void {
	console.log("[agent-setup] Initializing agent hooks...");

	fs.mkdirSync(BIN_DIR, { recursive: true });
	fs.mkdirSync(HOOKS_DIR, { recursive: true });
	fs.mkdirSync(ZSH_DIR, { recursive: true });
	fs.mkdirSync(BASH_DIR, { recursive: true });

	createNotifyScript();
	createClaudeWrapper();
	createCodexWrapper();
	createZshWrapper();
	createBashWrapper();

	console.log("[agent-setup] Agent hooks initialized");
}

export function getShellEnv(shell: string): Record<string, string> {
	if (shell.includes("zsh")) {
		return {
			SUPERSET_ORIG_ZDOTDIR: process.env.ZDOTDIR || os.homedir(),
			ZDOTDIR: ZSH_DIR,
		};
	}
	// Bash doesn't need special env vars - we use --rcfile instead
	return {};
}

export function getShellArgs(shell: string): string[] {
	if (shell.includes("zsh")) {
		return ["-l"];
	}
	if (shell.includes("bash")) {
		return ["--rcfile", path.join(BASH_DIR, "rcfile")];
	}
	return [];
}

export function getSupersetBinDir(): string {
	return BIN_DIR;
}
