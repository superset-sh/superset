import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { BASH_DIR, BIN_DIR, ZSH_DIR } from "./paths";

const ZSH_PROFILE = path.join(ZSH_DIR, ".zprofile");
const ZSH_RC = path.join(ZSH_DIR, ".zshrc");
const ZSH_LOGIN = path.join(ZSH_DIR, ".zlogin");
const BASH_RCFILE = path.join(BASH_DIR, "rcfile");

const SHELL_WRAPPER_SIGNATURE = "# Superset shell-wrapper";
const SHELL_WRAPPER_VERSION = "v2";
export const SHELL_WRAPPER_MARKER = `${SHELL_WRAPPER_SIGNATURE} ${SHELL_WRAPPER_VERSION}`;

/** Agent binaries that get wrapper shims to guarantee resolution. */
const SHIMMED_BINARIES = ["claude", "codex", "opencode", "gemini", "copilot"];

/**
 * Shell function shims that override PATH-based lookup.
 * Functions take precedence over PATH in both zsh and bash,
 * so even if a precmd hook or .zlogin re-orders PATH, the
 * wrapped binary is always invoked.
 */
function buildShimFunctions(): string {
	return SHIMMED_BINARIES.map(
		(name) => `${name}() { "${BIN_DIR}/${name}" "$@"; }`,
	).join("\n");
}

function buildPathPrependFunction(): string {
	return `_superset_prepend_bin() {
  case ":$PATH:" in
    *:"${BIN_DIR}":*) ;;
    *) export PATH="${BIN_DIR}:$PATH" ;;
  esac
}
_superset_prepend_bin`;
}

// --- Content getters (pure, no I/O) ---

export function getZshProfilePath(): string {
	return path.join(ZSH_DIR, ".zprofile");
}

export function getZshRcPath(): string {
	return path.join(ZSH_DIR, ".zshrc");
}

export function getZshLoginPath(): string {
	return path.join(ZSH_DIR, ".zlogin");
}

export function getBashRcfilePath(): string {
	return path.join(BASH_DIR, "rcfile");
}

export function getZshProfileContent(): string {
	return `${SHELL_WRAPPER_MARKER}
# Superset zsh profile wrapper
_superset_home="\${SUPERSET_ORIG_ZDOTDIR:-$HOME}"
[[ -f "$_superset_home/.zprofile" ]] && source "$_superset_home/.zprofile"
`;
}

export function getZshRcContent(): string {
	// .zshrc applies PATH + shims after sourcing the user's .zshrc.
	// No rehash here — .zlogin re-applies everything after .zlogin runs,
	// so a single rehash there covers both phases.
	return `${SHELL_WRAPPER_MARKER}
# Superset zsh rc wrapper
_superset_home="\${SUPERSET_ORIG_ZDOTDIR:-$HOME}"
export ZDOTDIR="$_superset_home"
[[ -f "$_superset_home/.zshrc" ]] && source "$_superset_home/.zshrc"
${buildPathPrependFunction()}
${buildShimFunctions()}
# Restore ZDOTDIR so our .zlogin runs after user's .zlogin
export ZDOTDIR="${ZSH_DIR}"
`;
}

export function getZshLoginContent(): string {
	// .zlogin runs AFTER .zshrc in login shells. By restoring ZDOTDIR above,
	// zsh sources our .zlogin instead of the user's directly. We source the
	// user's .zlogin only for interactive shells, then re-apply command shims
	// and prepend BIN_DIR so tools like mise, nvm, or PATH exports in .zlogin
	// can't shadow our wrappers.
	return `${SHELL_WRAPPER_MARKER}
# Superset zsh login wrapper
_superset_home="\${SUPERSET_ORIG_ZDOTDIR:-$HOME}"
if [[ -o interactive ]]; then
  [[ -f "$_superset_home/.zlogin" ]] && source "$_superset_home/.zlogin"
fi
${buildPathPrependFunction()}
${buildShimFunctions()}
rehash 2>/dev/null || true
export ZDOTDIR="$_superset_home"
`;
}

export function getBashRcfileContent(): string {
	return `${SHELL_WRAPPER_MARKER}
# Superset bash rcfile wrapper

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

# Keep superset bin first without duplicating entries
${buildPathPrependFunction()}
${buildShimFunctions()}
hash -r 2>/dev/null || true
# Minimal prompt (path/env shown in toolbar) - emerald to match app theme
export PS1=$'\\[\\e[1;38;2;52;211;153m\\]❯\\[\\e[0m\\] '
`;
}

// --- Runtime helpers ---

function hasZshWrappers(): boolean {
	return existsSync(ZSH_PROFILE) && existsSync(ZSH_RC) && existsSync(ZSH_LOGIN);
}

function hasBashWrapper(): boolean {
	return existsSync(BASH_RCFILE);
}

export function getShellEnv(shell: string): Record<string, string> {
	if (shell.includes("zsh") && hasZshWrappers()) {
		return {
			SUPERSET_ORIG_ZDOTDIR: process.env.ZDOTDIR || os.homedir(),
			ZDOTDIR: ZSH_DIR,
		};
	}
	return {};
}

export function getShellArgs(shell: string): string[] {
	if (shell.includes("zsh")) {
		return ["-l"];
	}
	if (shell.includes("bash")) {
		if (!hasBashWrapper()) {
			return ["-l"];
		}
		return ["--rcfile", BASH_RCFILE];
	}
	return [];
}

/**
 * Shell args for non-interactive command execution (`-c`) that sources
 * user profiles via wrappers. Falls back to login shell if wrappers
 * don't exist yet (e.g. before ensureAgentHooks runs).
 *
 * Unlike getShellArgs (interactive), we must source profiles inline because:
 * - zsh skips .zshrc for non-interactive shells
 * - bash ignores --rcfile when -c is present
 */
export function getCommandShellArgs(shell: string, command: string): string[] {
	if (shell.includes("zsh") && existsSync(ZSH_RC)) {
		return ["-lc", `source "${ZSH_RC}" && ${command}`];
	}
	if (shell.includes("bash") && existsSync(BASH_RCFILE)) {
		return ["-c", `source "${BASH_RCFILE}" && ${command}`];
	}
	return ["-lc", command];
}
