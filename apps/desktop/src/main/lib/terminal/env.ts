import { execSync } from "node:child_process";
import os from "node:os";
import defaultShell from "default-shell";
import { PORTS } from "shared/constants";
import { env } from "shared/env.shared";
import { getShellEnv } from "../agent-setup/shell-wrappers";

/**
 * Current hook protocol version.
 * Increment when making breaking changes to the hook protocol.
 * The server logs this for debugging version mismatches.
 */
export const HOOK_PROTOCOL_VERSION = "2";

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
 * Allowlist of environment variable names safe to pass to terminals.
 * Using an allowlist (vs denylist) ensures unknown vars (including secrets) are excluded by default.
 *
 * IMPORTANT: On Windows, env var keys are case-insensitive. The system may store
 * "Path" instead of "PATH", "SystemRoot" instead of "SYSTEMROOT", etc.
 * We store uppercase versions here and do case-insensitive matching on Windows.
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
	// Note: proxy vars are case-sensitive on Unix, so we include both cases
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
	// Note: Windows stores these with various casings (Path, SystemRoot, etc.)
	// but we match case-insensitively on win32
	"COMSPEC",
	"USERPROFILE",
	"APPDATA",
	"LOCALAPPDATA",
	"PROGRAMFILES",
	"PROGRAMFILES(X86)",
	"SYSTEMROOT",
	"WINDIR",
	"TEMP",
	"TMP",
	"PATHEXT", // Required for command resolution on Windows

	// SSL/TLS configuration (custom certs, not secrets)
	"SSL_CERT_FILE",
	"SSL_CERT_DIR",
	"NODE_EXTRA_CA_CERTS",
	"REQUESTS_CA_BUNDLE", // Python requests library

	// Git configuration (not credentials)
	"GIT_SSH_COMMAND",
	"GIT_AUTHOR_NAME",
	"GIT_AUTHOR_EMAIL",
	"GIT_COMMITTER_NAME",
	"GIT_COMMITTER_EMAIL",
	"GIT_EDITOR",
	"GIT_PAGER",

	// AWS configuration (profile selection, not credentials)
	// Actual secrets are in ~/.aws/credentials, not env vars
	"AWS_PROFILE",
	"AWS_DEFAULT_REGION",
	"AWS_REGION",
	"AWS_CONFIG_FILE",
	"AWS_SHARED_CREDENTIALS_FILE",

	// Docker configuration (not credentials)
	"DOCKER_HOST",
	"DOCKER_CONFIG",
	"DOCKER_CERT_PATH",
	"DOCKER_TLS_VERIFY",
	"COMPOSE_PROJECT_NAME",

	// Kubernetes configuration (not credentials)
	"KUBECONFIG",
	"KUBE_CONFIG_PATH",

	// Cloud CLI tools (not credentials)
	"CLOUDSDK_CONFIG", // Google Cloud SDK
	"AZURE_CONFIG_DIR", // Azure CLI

	// SDK paths (not secrets)
	"JAVA_HOME",
	"ANDROID_HOME",
	"ANDROID_SDK_ROOT",
	"FLUTTER_ROOT",
	"DOTNET_ROOT",
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
 * Check if a key is in the allowlist, handling Windows case-insensitivity.
 * @param key - The environment variable key
 * @param isWindows - Whether running on Windows (for case-insensitive matching)
 */
function isAllowedVar(key: string, isWindows: boolean): boolean {
	// On Windows, env vars are case-insensitive
	// The system may store "Path" instead of "PATH"
	if (isWindows) {
		return ALLOWED_ENV_VARS.has(key.toUpperCase());
	}
	return ALLOWED_ENV_VARS.has(key);
}

/**
 * Check if a key matches an allowed prefix, handling Windows case-insensitivity.
 * @param key - The environment variable key
 * @param isWindows - Whether running on Windows (for case-insensitive matching)
 */
function hasAllowedPrefix(key: string, isWindows: boolean): boolean {
	const keyToCheck = isWindows ? key.toUpperCase() : key;
	return ALLOWED_PREFIXES.some((prefix) => keyToCheck.startsWith(prefix));
}

/**
 * Build a safe environment by only including allowlisted variables.
 * This prevents Superset app secrets and build-time config from leaking to terminals.
 *
 * Threat model: Prevent app secrets (DATABASE_URL, API keys from .env) from leaking.
 * User shell config vars (proxy, tool paths) are intentionally allowed so terminals
 * behave like the user's normal environment.
 *
 * Allowlist approach rationale:
 * - Unknown vars excluded by default (prevents app secrets like DATABASE_URL from leaking)
 * - Only infrastructure vars (PATH, HOME, etc.) pass through from Electron
 * - Shell initialization vars (ZDOTDIR, BASH_ENV) are added separately via shellEnv
 *
 * Note: Allowlisted vars like HTTP_PROXY may contain user-configured credentials.
 *
 * @param env - The environment variables to filter
 * @param options - Optional configuration
 * @param options.platform - Override platform detection (for testing)
 */
export function buildSafeEnv(
	env: Record<string, string>,
	options?: { platform?: NodeJS.Platform },
): Record<string, string> {
	const platform = options?.platform ?? os.platform();
	const isWindows = platform === "win32";
	const safe: Record<string, string> = {};

	for (const [key, value] of Object.entries(env)) {
		// Check exact match (case-insensitive on Windows)
		if (isAllowedVar(key, isWindows)) {
			safe[key] = value;
			continue;
		}

		// Check prefix match (case-insensitive on Windows)
		if (hasAllowedPrefix(key, isWindows)) {
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

	const terminalEnv: Record<string, string> = {
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
		// Environment identifier for dev/prod separation
		SUPERSET_ENV: env.NODE_ENV === "development" ? "development" : "production",
		// Hook protocol version for forward compatibility
		SUPERSET_HOOK_VERSION: HOOK_PROTOCOL_VERSION,
	};

	delete terminalEnv.GOOGLE_API_KEY;

	return terminalEnv;
}
