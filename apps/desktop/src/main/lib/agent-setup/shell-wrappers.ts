import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SUPERSET_DIR_NAME } from "shared/constants";
import { BASH_DIR, ZSH_DIR } from "./paths";

/**
 * Creates zsh initialization wrapper that intercepts shell startup
 * Sources user's real shell config files then prepends our bin to PATH
 */
export function createZshWrapper(): void {
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

# Superset command history hooks
# OSC 133 sequences for shell integration
# C = command start (with command text), D = command done (with exit code)
_superset_preexec() {
  # Emit OSC 133;C with the command being executed
  printf '\\033]133;C;%s\\033\\\\' "\${1//[[:cntrl:]]}"
}
_superset_precmd() {
  local exit_code=$?
  # Emit OSC 133;D with the exit code
  printf '\\033]133;D;%d\\033\\\\' "$exit_code"
}
# Add hooks if not already added
if [[ -z "\${_superset_hooks_installed}" ]]; then
  autoload -Uz add-zsh-hook
  add-zsh-hook preexec _superset_preexec
  add-zsh-hook precmd _superset_precmd
  _superset_hooks_installed=1
fi
`;
	fs.writeFileSync(zshrcPath, zshrcScript, { mode: 0o644 });
	console.log("[agent-setup] Created zsh wrapper");
}

/**
 * Creates bash initialization wrapper that intercepts shell startup
 * Sources user's real bashrc/profile then prepends our bin to PATH
 */
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

# Prepend superset bin to PATH
export PATH="$HOME/${SUPERSET_DIR_NAME}/bin:$PATH"
# Minimal prompt (path/env shown in toolbar) - emerald to match app theme
export PS1=$'\\[\\e[1;38;2;52;211;153m\\]❯\\[\\e[0m\\] '

# Superset command history hooks
# OSC 133 sequences for shell integration
_superset_last_cmd=""
_superset_trap_debug() {
  # Capture the command before execution
  _superset_last_cmd="$BASH_COMMAND"
}
_superset_prompt_command() {
  local exit_code=$?
  # Emit command done with exit code
  printf '\\033]133;D;%d\\033\\\\' "$exit_code"
  # Emit command start when we have a captured command
  if [[ -n "$_superset_last_cmd" && "$_superset_last_cmd" != "_superset_prompt_command" ]]; then
    printf '\\033]133;C;%s\\033\\\\' "\${_superset_last_cmd//[[:cntrl:]]}"
  fi
  _superset_last_cmd=""
}
# Install hooks if not already installed
if [[ -z "\${_superset_hooks_installed}" ]]; then
  trap '_superset_trap_debug' DEBUG
  PROMPT_COMMAND="_superset_prompt_command\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
  _superset_hooks_installed=1
fi
`;
	fs.writeFileSync(rcfilePath, script, { mode: 0o644 });
	console.log("[agent-setup] Created bash wrapper");
}

/**
 * Returns shell-specific environment variables for intercepting shell initialization
 */
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

/**
 * Returns shell-specific arguments for intercepting shell initialization
 */
export function getShellArgs(shell: string): string[] {
	if (shell.includes("zsh")) {
		// Zsh uses ZDOTDIR env var, no special args needed
		// -l for login shell behavior
		return ["-l"];
	}
	if (shell.includes("bash")) {
		// Use our custom rcfile that sources user's files then fixes PATH
		return ["--rcfile", path.join(BASH_DIR, "rcfile")];
	}
	return [];
}
