import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BASH_DIR, BIN_DIR, ZSH_DIR } from "./paths";

export interface ShellWrapperPaths {
	BIN_DIR: string;
	ZSH_DIR: string;
	BASH_DIR: string;
}

const DEFAULT_PATHS: ShellWrapperPaths = {
	BIN_DIR,
	ZSH_DIR,
	BASH_DIR,
};

const MANAGED_BINARIES = [
	"claude",
	"codex",
	"opencode",
	"gemini",
	"copilot",
	"mastracode",
] as const;

function getShellName(shell: string): string {
	return shell.split("/").pop() || shell;
}

function buildManagedCommandPrelude(shellName: string, binDir: string): string {
	if (shellName === "fish") {
		return MANAGED_BINARIES.map(
			(name) =>
				`functions -q ${name}; and functions -e ${name}
function ${name}
  set -l _superset_wrapper "${binDir}/${name}"
  if test -x "$_superset_wrapper"; and not test -d "$_superset_wrapper"
    "$_superset_wrapper" $argv
  else
    command ${name} $argv
  end
end`,
		).join("\n");
	}

	return MANAGED_BINARIES.map(
		(name) =>
			`unalias ${name} 2>/dev/null || true
${name}() {
  _superset_wrapper="${binDir}/${name}"
  if [ -x "$_superset_wrapper" ] && [ ! -d "$_superset_wrapper" ]; then
    "$_superset_wrapper" "$@"
  else
    command ${name} "$@"
  fi
}`,
	).join("\n");
}

function writeFileIfChanged(
	filePath: string,
	content: string,
	mode: number,
): boolean {
	const existing = fs.existsSync(filePath)
		? fs.readFileSync(filePath, "utf-8")
		: null;
	if (existing === content) {
		try {
			fs.chmodSync(filePath, mode);
		} catch {
			// Best effort.
		}
		return false;
	}

	fs.writeFileSync(filePath, content, { mode });
	try {
		fs.chmodSync(filePath, mode);
	} catch {
		// Best effort.
	}
	return true;
}

function escapeFishDoubleQuoted(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll('"', '\\"')
		.replaceAll("$", "\\$");
}

export function createZshWrapper(
	paths: ShellWrapperPaths = DEFAULT_PATHS,
): void {
	// Keep wrapper bin first after user init files are done.
	const integrationPath = path.join(
		paths.ZSH_DIR,
		"superset-zsh-integration.zsh",
	);
	const integrationScript = `# Superset zsh integration
# Keep BIN_DIR first even if user prompt hooks rewrite PATH.
_superset_fix_path() {
  local superset_bin="${paths.BIN_DIR}"
  [[ -d "$superset_bin" ]] || return 0
  local -a parts=("\${(@s/:/)PATH}")
  parts=("\${(@)parts:#$superset_bin}")
  PATH="$superset_bin:\${(j/:/)parts}"
}
_superset_reorder_hooks() {
  add-zsh-hook -d precmd _superset_precmd 2>/dev/null || true
  add-zsh-hook precmd _superset_precmd
  add-zsh-hook -d preexec _superset_fix_path 2>/dev/null || true
  add-zsh-hook preexec _superset_fix_path
}
_superset_precmd() {
  _superset_reorder_hooks
  _superset_fix_path
}
autoload -Uz add-zsh-hook
_superset_fix_path
_superset_reorder_hooks
`;
	const wroteIntegration = writeFileIfChanged(
		integrationPath,
		integrationScript,
		0o644,
	);

	// .zshenv is always sourced first by zsh (interactive + non-interactive).
	// Restore original ZDOTDIR immediately so zsh loads user startup files naturally.
	const zshenvPath = path.join(paths.ZSH_DIR, ".zshenv");
	const zshenvScript = `# Superset zsh env wrapper
if [[ -n "\${SUPERSET_ORIG_ZDOTDIR+X}" ]]; then
  export ZDOTDIR="$SUPERSET_ORIG_ZDOTDIR"
else
  unset ZDOTDIR
fi

{
  _superset_file="\${ZDOTDIR-$HOME}/.zshenv"
  [[ ! -r "$_superset_file" ]] || source -- "$_superset_file"
} always {
  if [[ -o interactive && "\${SUPERSET_SHELL_INTEGRATION:-1}" != "0" ]]; then
    _superset_integ="\${SUPERSET_SHELL_INTEGRATION_DIR:-${paths.ZSH_DIR}}/superset-zsh-integration.zsh"
    [[ -r "$_superset_integ" ]] && source -- "$_superset_integ"
  fi
  unset _superset_file _superset_integ
}
`;
	const wroteZshenv = writeFileIfChanged(zshenvPath, zshenvScript, 0o644);

	// Compatibility shim: this should not run in normal flow because .zshenv
	// restores ZDOTDIR first. If reached, behave like vanilla zsh.
	const zprofilePath = path.join(paths.ZSH_DIR, ".zprofile");
	const zprofileScript = `# Superset zsh profile wrapper
if [[ -n "\${SUPERSET_ORIG_ZDOTDIR+X}" ]]; then
  export ZDOTDIR="$SUPERSET_ORIG_ZDOTDIR"
else
  unset ZDOTDIR
fi
_superset_file="\${ZDOTDIR-$HOME}/.zprofile"
[[ ! -r "$_superset_file" ]] || source -- "$_superset_file"
unset _superset_file
`;
	const wroteZprofile = writeFileIfChanged(zprofilePath, zprofileScript, 0o644);

	// Compatibility shim mirroring .zprofile behavior.
	const zshrcPath = path.join(paths.ZSH_DIR, ".zshrc");
	const zshrcScript = `# Superset zsh rc wrapper
if [[ -n "\${SUPERSET_ORIG_ZDOTDIR+X}" ]]; then
  export ZDOTDIR="$SUPERSET_ORIG_ZDOTDIR"
else
  unset ZDOTDIR
fi
_superset_file="\${ZDOTDIR-$HOME}/.zshrc"
[[ ! -r "$_superset_file" ]] || source -- "$_superset_file"
unset _superset_file
`;
	const wroteZshrc = writeFileIfChanged(zshrcPath, zshrcScript, 0o644);

	// Compatibility shim mirroring .zprofile behavior.
	const zloginPath = path.join(paths.ZSH_DIR, ".zlogin");
	const zloginScript = `# Superset zsh login wrapper
if [[ -n "\${SUPERSET_ORIG_ZDOTDIR+X}" ]]; then
  export ZDOTDIR="$SUPERSET_ORIG_ZDOTDIR"
else
  unset ZDOTDIR
fi
_superset_file="\${ZDOTDIR-$HOME}/.zlogin"
[[ ! -r "$_superset_file" ]] || source -- "$_superset_file"
unset _superset_file
`;
	const wroteZlogin = writeFileIfChanged(zloginPath, zloginScript, 0o644);
	const changed =
		wroteIntegration ||
		wroteZshenv ||
		wroteZprofile ||
		wroteZshrc ||
		wroteZlogin;
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} zsh wrapper files`,
	);
}

export function createBashWrapper(
	paths: ShellWrapperPaths = DEFAULT_PATHS,
): void {
	const integrationPath = path.join(
		paths.BASH_DIR,
		"superset-bash-integration.bash",
	);
	const integrationScript = `# Superset bash integration
_superset_fix_path() {
  local superset_bin="${paths.BIN_DIR}"
  [[ -d "$superset_bin" ]] || return 0
  local new_path=":$PATH:"
  new_path="\${new_path//:$superset_bin:/:}"
  new_path="\${new_path#:}"
  new_path="\${new_path%:}"
  export PATH="$superset_bin:$new_path"
}
_superset_install_prompt_command() {
  local decl
  decl="$(declare -p PROMPT_COMMAND 2>/dev/null || true)"
  if [[ "$decl" == "declare -a"* ]]; then
    local item
    for item in "\${PROMPT_COMMAND[@]}"; do
      [[ "$item" == "_superset_fix_path" ]] && return 0
    done
    PROMPT_COMMAND+=("_superset_fix_path")
    return 0
  fi

  case ";\${PROMPT_COMMAND:-};" in
    *";_superset_fix_path;"*) return 0 ;;
  esac

  if [[ -n "\${PROMPT_COMMAND:-}" ]]; then
    PROMPT_COMMAND="\${PROMPT_COMMAND};_superset_fix_path"
  else
    PROMPT_COMMAND="_superset_fix_path"
  fi
}
_superset_fix_path
_superset_install_prompt_command
`;
	const wroteIntegration = writeFileIfChanged(
		integrationPath,
		integrationScript,
		0o644,
	);

	const rcfilePath = path.join(paths.BASH_DIR, "rcfile");
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

# Load Superset bash integration (PATH fix after user init)
[[ -f "${integrationPath}" ]] && source "${integrationPath}"
hash -r 2>/dev/null || true
# Minimal prompt (path/env shown in toolbar) - emerald to match app theme
export PS1=$'\\[\\e[1;38;2;52;211;153m\\]❯\\[\\e[0m\\] '
`;
	const wroteRcfile = writeFileIfChanged(rcfilePath, script, 0o644);
	const changed = wroteIntegration || wroteRcfile;
	console.log(`[agent-setup] ${changed ? "Updated" : "Verified"} bash wrapper`);
}

export function getShellEnv(
	shell: string,
	paths: ShellWrapperPaths = DEFAULT_PATHS,
): Record<string, string> {
	const shellName = getShellName(shell);
	if (shellName === "zsh") {
		return {
			SUPERSET_ORIG_ZDOTDIR: process.env.ZDOTDIR || os.homedir(),
			SUPERSET_SHELL_INTEGRATION: "1",
			SUPERSET_SHELL_INTEGRATION_DIR: paths.ZSH_DIR,
			ZDOTDIR: paths.ZSH_DIR,
		};
	}
	return {};
}

export function getShellArgs(
	shell: string,
	paths: ShellWrapperPaths = DEFAULT_PATHS,
): string[] {
	const shellName = getShellName(shell);
	if (shellName === "bash") {
		return ["--rcfile", path.join(paths.BASH_DIR, "rcfile")];
	}
	if (shellName === "fish") {
		// Use --init-command to prepend BIN_DIR to PATH after config is loaded.
		// Use fish list-aware checks to avoid duplicate PATH entries across nested shells.
		const escapedBinDir = escapeFishDoubleQuoted(paths.BIN_DIR);
		return [
			"-l",
			"--init-command",
			`set -l _superset_bin "${escapedBinDir}"; contains -- "$_superset_bin" $PATH; or set -gx PATH "$_superset_bin" $PATH`,
		];
	}
	if (["zsh", "sh", "ksh"].includes(shellName)) {
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
 * - managed binary prelude enforces app wrappers while falling back to system bins
 */
export function getCommandShellArgs(
	shell: string,
	command: string,
	paths: ShellWrapperPaths = DEFAULT_PATHS,
): string[] {
	const shellName = getShellName(shell);
	const zshRc = path.join(paths.ZSH_DIR, ".zshrc");
	const bashRcfile = path.join(paths.BASH_DIR, "rcfile");
	const commandWithManagedPrelude = `${buildManagedCommandPrelude(shellName, paths.BIN_DIR)}\n${command}`;
	if (shellName === "zsh" && fs.existsSync(zshRc)) {
		return ["-lc", `source "${zshRc}" &&\n${commandWithManagedPrelude}`];
	}
	if (shellName === "bash" && fs.existsSync(bashRcfile)) {
		return ["-c", `source "${bashRcfile}" &&\n${commandWithManagedPrelude}`];
	}
	return ["-lc", commandWithManagedPrelude];
}
