import { execSync } from "node:child_process";
import os from "node:os";
import defaultShell from "default-shell";
import { PORTS } from "shared/constants";
import { getShellEnv } from "../agent-setup/shell-wrappers";

export const FALLBACK_SHELL = os.platform() === "win32" ? "cmd.exe" : "/bin/sh";
export const SHELL_CRASH_THRESHOLD_MS = 1000;

export function getDefaultShell(): string {
	if (defaultShell) {
		return defaultShell;
	}

	const platform = os.platform();

	if (platform === "win32") {
		return process.env.COMSPEC || "powershell.exe";
	}

	if (process.env.SHELL) {
		return process.env.SHELL;
	}

	return "/bin/sh";
}

export function getLocale(baseEnv: Record<string, string>): string {
	if (baseEnv.LANG?.includes("UTF-8")) {
		return baseEnv.LANG;
	}

	if (baseEnv.LC_ALL?.includes("UTF-8")) {
		return baseEnv.LC_ALL;
	}

	try {
		const result = execSync("locale 2>/dev/null | grep LANG= | cut -d= -f2", {
			encoding: "utf-8",
			timeout: 1000,
		}).trim();
		if (result?.includes("UTF-8")) {
			return result;
		}
	} catch {
		// Ignore - will use fallback
	}

	return "en_US.UTF-8";
}

export function sanitizeEnv(
	env: NodeJS.ProcessEnv,
): Record<string, string> | undefined {
	const sanitized: Record<string, string> = {};

	for (const [key, value] of Object.entries(env)) {
		if (typeof value === "string") {
			sanitized[key] = value;
		}
	}

	return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

/**
 * Allowlist of exact environment variable names safe to pass to terminals.
 * Using an allowlist (vs denylist) ensures unknown vars (including secrets) are excluded by default.
 */
const ALLOWED_ENV_VARS = new Set([
	// Core shell environment
	"PATH",
	"HOME",
	"USER",
	"LOGNAME",
	"SHELL",
	"TERM",
	"TMPDIR",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"LC_MESSAGES",
	"LC_COLLATE",
	"LC_MONETARY",
	"LC_NUMERIC",
	"LC_TIME",
	"TZ",

	// Terminal/display
	"DISPLAY",
	"COLORTERM",
	"TERM_PROGRAM",
	"TERM_PROGRAM_VERSION",
	"COLUMNS",
	"LINES",

	// SSH (critical for git operations)
	"SSH_AUTH_SOCK",
	"SSH_AGENT_PID",

	// Proxy configuration (user may need for network access)
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"http_proxy",
	"https_proxy",
	"NO_PROXY",
	"no_proxy",
	"ALL_PROXY",
	"all_proxy",
	"FTP_PROXY",
	"ftp_proxy",

	// Language version managers (users expect these to work)
	"NVM_DIR",
	"NVM_BIN",
	"NVM_INC",
	"NVM_CD_FLAGS",
	"NVM_RC_VERSION",
	"PYENV_ROOT",
	"PYENV_SHELL",
	"PYENV_VERSION",
	"RBENV_ROOT",
	"RBENV_SHELL",
	"RBENV_VERSION",
	"GOPATH",
	"GOROOT",
	"GOBIN",
	"CARGO_HOME",
	"RUSTUP_HOME",
	"DENO_DIR",
	"DENO_INSTALL",
	"BUN_INSTALL",
	"PNPM_HOME",
	"VOLTA_HOME",
	"ASDF_DIR",
	"ASDF_DATA_DIR",
	"FNM_DIR",
	"FNM_MULTISHELL_PATH",
	"FNM_NODE_DIST_MIRROR",
	"SDKMAN_DIR",

	// Homebrew
	"HOMEBREW_PREFIX",
	"HOMEBREW_CELLAR",
	"HOMEBREW_REPOSITORY",

	// XDG directories (Linux/macOS standards)
	"XDG_CONFIG_HOME",
	"XDG_DATA_HOME",
	"XDG_CACHE_HOME",
	"XDG_STATE_HOME",
	"XDG_RUNTIME_DIR",

	// Editor (user preference, safe)
	"EDITOR",
	"VISUAL",
	"PAGER",

	// macOS specific
	"__CF_USER_TEXT_ENCODING",
	"Apple_PubSub_Socket_Render",

	// Windows specific (for cross-platform compatibility)
	"COMSPEC",
	"USERPROFILE",
	"APPDATA",
	"LOCALAPPDATA",
	"PROGRAMFILES",
	"SYSTEMROOT",
	"WINDIR",
]);

/**
 * Prefixes for environment variables that are safe to pass through.
 * These are checked after exact matches fail.
 */
const ALLOWED_PREFIXES = [
	"SUPERSET_", // Our own metadata vars
	"LC_", // Locale settings
];

/**
 * Build a safe environment by only including allowlisted variables.
 * This prevents secrets and app-specific config from leaking to terminals.
 *
 * Allowlist approach rationale:
 * - Secrets can't leak (unknown vars excluded by default)
 * - User's legitimate shell env is preserved via shellEnv (loaded separately)
 * - Only infrastructure vars (PATH, HOME, etc.) pass through from Electron
 */
export function buildSafeEnv(
	env: Record<string, string>,
): Record<string, string> {
	const safe: Record<string, string> = {};

	for (const [key, value] of Object.entries(env)) {
		// Check exact match first
		if (ALLOWED_ENV_VARS.has(key)) {
			safe[key] = value;
			continue;
		}

		// Check prefix match
		if (ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
			safe[key] = value;
		}
	}

	return safe;
}

/**
 * @deprecated Use buildSafeEnv instead. Kept for backward compatibility.
 */
export function removeAppEnvVars(
	env: Record<string, string>,
): Record<string, string> {
	return buildSafeEnv(env);
}

export function buildTerminalEnv(params: {
	shell: string;
	paneId: string;
	tabId: string;
	workspaceId: string;
	workspaceName?: string;
	workspacePath?: string;
	rootPath?: string;
}): Record<string, string> {
	const {
		shell,
		paneId,
		tabId,
		workspaceId,
		workspaceName,
		workspacePath,
		rootPath,
	} = params;

	// Get Electron's process.env and filter to only allowlisted safe vars
	// This prevents secrets and app config from leaking to user terminals
	const rawBaseEnv = sanitizeEnv(process.env) || {};
	const baseEnv = buildSafeEnv(rawBaseEnv);

	// shellEnv provides shell wrapper control variables (ZDOTDIR, BASH_ENV, etc.)
	// These configure how the shell initializes, not the user's actual environment
	const shellEnv = getShellEnv(shell);
	const locale = getLocale(rawBaseEnv);

	const env: Record<string, string> = {
		...baseEnv,
		...shellEnv,
		TERM_PROGRAM: "Superset",
		TERM_PROGRAM_VERSION: process.env.npm_package_version || "1.0.0",
		COLORTERM: "truecolor",
		LANG: locale,
		SUPERSET_PANE_ID: paneId,
		SUPERSET_TAB_ID: tabId,
		SUPERSET_WORKSPACE_ID: workspaceId,
		SUPERSET_WORKSPACE_NAME: workspaceName || "",
		SUPERSET_WORKSPACE_PATH: workspacePath || "",
		SUPERSET_ROOT_PATH: rootPath || "",
		SUPERSET_PORT: String(PORTS.NOTIFICATIONS),
	};

	return env;
}
