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
