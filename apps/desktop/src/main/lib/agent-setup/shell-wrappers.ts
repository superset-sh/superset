import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BASH_DIR, BIN_DIR, ZSH_DIR } from "./paths";

const ZSH_RC = path.join(ZSH_DIR, ".zshrc");
const BASH_RCFILE = path.join(BASH_DIR, "rcfile");

function writeFileIfChanged(
	filePath: string,
	content: string,
	mode: number,
): boolean {
	const existing = fs.existsSync(filePath)
		? fs.readFileSync(filePath, "utf-8")
		: null;
	if (existing === content) {
		return false;
	}

	fs.writeFileSync(filePath, content, { mode });
	return true;
}

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

export function createZshWrapper(): void {
	// .zshenv is always sourced first by zsh (interactive + non-interactive).
	// Temporarily restore the user's ZDOTDIR while sourcing user config, then
	// switch back so zsh continues through our wrapper chain.
	const zshenvPath = path.join(ZSH_DIR, ".zshenv");
	const zshenvScript = `# Superset zsh env wrapper
_superset_home="\${SUPERSET_ORIG_ZDOTDIR:-$HOME}"
export ZDOTDIR="$_superset_home"
[[ -f "$_superset_home/.zshenv" ]] && source "$_superset_home/.zshenv"
export ZDOTDIR="${ZSH_DIR}"
`;
	const wroteZshenv = writeFileIfChanged(zshenvPath, zshenvScript, 0o644);

	// Source user .zprofile with their ZDOTDIR, then restore wrapper ZDOTDIR
	// so startup continues into our .zshrc wrapper.
	const zprofilePath = path.join(ZSH_DIR, ".zprofile");
	const zprofileScript = `# Superset zsh profile wrapper
_superset_home="\${SUPERSET_ORIG_ZDOTDIR:-$HOME}"
export ZDOTDIR="$_superset_home"
[[ -f "$_superset_home/.zprofile" ]] && source "$_superset_home/.zprofile"
export ZDOTDIR="${ZSH_DIR}"
`;
	const wroteZprofile = writeFileIfChanged(zprofilePath, zprofileScript, 0o644);

	// Reset ZDOTDIR before sourcing so Oh My Zsh works correctly
	const zshrcPath = path.join(ZSH_DIR, ".zshrc");
	const zshrcScript = `# Superset zsh rc wrapper
_superset_home="\${SUPERSET_ORIG_ZDOTDIR:-$HOME}"
export ZDOTDIR="$_superset_home"
[[ -f "$_superset_home/.zshrc" ]] && source "$_superset_home/.zshrc"
${buildPathPrependFunction()}
${buildShimFunctions()}
rehash 2>/dev/null || true
# Restore ZDOTDIR so our .zlogin runs after user's .zlogin
export ZDOTDIR="${ZSH_DIR}"
`;
	const wroteZshrc = writeFileIfChanged(zshrcPath, zshrcScript, 0o644);

	// .zlogin runs AFTER .zshrc in login shells. By restoring ZDOTDIR above,
	// zsh sources our .zlogin instead of the user's directly. We source the
	// user's .zlogin only for interactive shells, then re-apply command shims
	// and prepend BIN_DIR so tools like mise, nvm, or PATH exports in .zlogin
	// can't shadow our wrappers.
	const zloginPath = path.join(ZSH_DIR, ".zlogin");
	const zloginScript = `# Superset zsh login wrapper
_superset_home="\${SUPERSET_ORIG_ZDOTDIR:-$HOME}"
if [[ -o interactive ]]; then
  [[ -f "$_superset_home/.zlogin" ]] && source "$_superset_home/.zlogin"
fi
${buildPathPrependFunction()}
${buildShimFunctions()}
rehash 2>/dev/null || true
export ZDOTDIR="$_superset_home"
`;
	const wroteZlogin = writeFileIfChanged(zloginPath, zloginScript, 0o644);
	const changed = wroteZshenv || wroteZprofile || wroteZshrc || wroteZlogin;
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} zsh wrapper files`,
	);
}

export function createBashWrapper(): void {
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

# Keep superset bin first without duplicating entries
${buildPathPrependFunction()}
${buildShimFunctions()}
hash -r 2>/dev/null || true
# Minimal prompt (path/env shown in toolbar) - emerald to match app theme
export PS1=$'\\[\\e[1;38;2;52;211;153m\\]❯\\[\\e[0m\\] '
`;
	const changed = writeFileIfChanged(rcfilePath, script, 0o644);
	console.log(`[agent-setup] ${changed ? "Updated" : "Verified"} bash wrapper`);
}

export function getShellEnv(shell: string): Record<string, string> {
	if (shell.includes("zsh")) {
		return {
			SUPERSET_ORIG_ZDOTDIR: process.env.ZDOTDIR || os.homedir(),
			ZDOTDIR: ZSH_DIR,
		};
	}
	return {};
}

export function getShellArgs(shell: string): string[] {
	const shellName = shell.split("/").pop() || shell;
	if (["zsh", "bash", "sh", "ksh", "fish"].includes(shellName)) {
		return ["-l"];
	}
	return [];
}

/**
 * Shell args for non-interactive command execution (`-c`) that sources
 * user profiles via wrappers. Falls back to login shell if wrappers
 * don't exist yet (e.g. before setupAgentHooks runs).
 *
 * Unlike getShellArgs (interactive), we must source profiles inline because:
 * - zsh skips .zshrc for non-interactive shells
 * - bash ignores --rcfile when -c is present
 */
export function getCommandShellArgs(shell: string, command: string): string[] {
	if (shell.includes("zsh") && fs.existsSync(ZSH_RC)) {
		return ["-lc", `source "${ZSH_RC}" && ${command}`];
	}
	if (shell.includes("bash") && fs.existsSync(BASH_RCFILE)) {
		return ["-c", `source "${BASH_RCFILE}" && ${command}`];
	}
	return ["-lc", command];
}
