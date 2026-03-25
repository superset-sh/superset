import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import defaultShell from "default-shell";
import { createWorkspace, registerAgent } from "@agent-relay/sdk/http";
import { env } from "shared/env.shared";
import { getShellEnv } from "../agent-setup/shell-wrappers";

const MACOS_SYSTEM_CERT_FILE = "/etc/ssl/cert.pem";
let cachedUtf8Locale: string | null = null;
let localeProbeInFlight = false;

// ── Relay workspace key (shared across all terminal sessions) ────
let cachedRelayApiKey: string | null = null;
const relayAgentNameCounters = new Map<string, number>();
const relayAgentRegistrations = new Map<string, { name: string; token: string }>();
const relayAgentRegistrationPromises = new Map<
	string,
	Promise<{ name: string; token: string } | null>
>();

/**
 * Ensure a shared Relay workspace key exists for agent-to-agent communication.
 * Creates a workspace on first call, caches the key for all subsequent sessions.
 */
export async function ensureRelayApiKey(): Promise<string | null> {
	if (cachedRelayApiKey) return cachedRelayApiKey;

	// Check if already set in environment
	const envKey = process.env.RELAY_API_KEY;
	if (envKey) {
		cachedRelayApiKey = envKey;
		return cachedRelayApiKey;
	}

	try {
		console.log("[relay] creating workspace...");
		const name = `superset-${os
			.hostname()
			.replace(/[^a-z0-9-]/gi, "")
			.slice(0, 20)}-${Date.now().toString(36)}`;
		const result = await createWorkspace(name);
		const apiKey = result.api_key;
		if (apiKey) {
			cachedRelayApiKey = apiKey;
			process.env.RELAY_API_KEY = cachedRelayApiKey;
			console.log("[relay] workspace created, key:", `${apiKey.slice(0, 15)}...`);
		} else {
			console.warn("[relay] no api_key in response:", JSON.stringify(result));
		}
	} catch (error) {
		console.warn("[relay] failed to create workspace:", error);
	}

	return cachedRelayApiKey;
}

export function generateAgentName(cliType: string): string {
	const normalizedCliType = cliType.trim().toLowerCase() || "agent";
	const nextCount = (relayAgentNameCounters.get(normalizedCliType) ?? 0) + 1;
	relayAgentNameCounters.set(normalizedCliType, nextCount);
	return `${normalizedCliType}-${nextCount}`;
}

async function registerRelayAgent(name: string): Promise<string | null> {
	const relayApiKey = cachedRelayApiKey ?? process.env.RELAY_API_KEY ?? null;
	if (!relayApiKey) return null;

	if (!cachedRelayApiKey) {
		cachedRelayApiKey = relayApiKey;
	}

	try {
		const result = await registerAgent(cachedRelayApiKey, name);
		return result.token ?? null;
	} catch (error) {
		console.warn("[relay] failed to register agent:", error);
		return null;
	}
}

const relayMcpConfigCache = new Map<string, string>();

/**
 * Ensure the project's .mcp.json includes the Relaycast MCP server with
 * the shared RELAY_API_KEY so Claude's MCP tools use the same workspace
 * as all other agents.
 */
function ensureRelayMcpConfig(
	projectDir: string,
	relayEnv?: {
		RELAY_AGENT_NAME?: string;
		RELAY_AGENT_TOKEN?: string;
		RELAY_SKIP_BOOTSTRAP?: string;
	},
): void {
	const relayApiKey = cachedRelayApiKey ?? process.env.RELAY_API_KEY;
	if (!relayApiKey || !projectDir) return;

	try {
		const mcpPath = `${projectDir}/.mcp.json`;
		const configSignature = JSON.stringify({
			RELAY_API_KEY: relayApiKey,
			RELAY_AGENT_NAME: relayEnv?.RELAY_AGENT_NAME ?? "",
			RELAY_AGENT_TOKEN: relayEnv?.RELAY_AGENT_TOKEN ?? "",
			RELAY_SKIP_BOOTSTRAP: relayEnv?.RELAY_SKIP_BOOTSTRAP ?? "",
		});
		if (relayMcpConfigCache.get(projectDir) === configSignature) {
			return;
		}

		const relaycastEntry = {
			command: "npx",
			args: ["-y", "@relaycast/mcp"],
			env: {
				RELAY_API_KEY: relayApiKey,
				RELAY_BASE_URL: "https://api.relaycast.dev",
			},
		};
		const agentRelayEntry = {
			command: "npx",
			args: ["-y", "@relaycast/mcp"],
			env: {
				RELAY_API_KEY: relayApiKey,
				RELAY_BASE_URL: "https://api.relaycast.dev",
				...(relayEnv?.RELAY_AGENT_NAME
					? { RELAY_AGENT_NAME: relayEnv.RELAY_AGENT_NAME }
					: {}),
				...(relayEnv?.RELAY_AGENT_TOKEN
					? { RELAY_AGENT_TOKEN: relayEnv.RELAY_AGENT_TOKEN }
					: {}),
				...(relayEnv?.RELAY_SKIP_BOOTSTRAP
					? { RELAY_SKIP_BOOTSTRAP: relayEnv.RELAY_SKIP_BOOTSTRAP }
					: {}),
				RELAY_STRICT_AGENT_NAME: "1",
			},
		};

		let config: Record<string, unknown> = { mcpServers: {} };
		if (fs.existsSync(mcpPath)) {
			try {
				config = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
			} catch {
				// Corrupted file — overwrite
			}
		}

		const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
		// Use both names: "relaycast" for codex/gemini and "agent-relay" to
		// override Claude's global marketplace plugin with the shared key
		servers.relaycast = relaycastEntry;
		servers["agent-relay"] = agentRelayEntry;
		config.mcpServers = servers;

		fs.writeFileSync(mcpPath, JSON.stringify(config, null, 2));
		relayMcpConfigCache.set(projectDir, configSignature);
		console.log(
			`[relay] wrote .mcp.json with shared workspace key in ${projectDir}`,
		);
	} catch (error) {
		console.warn("[relay] failed to write .mcp.json:", error);
	}
}
const PROCESS_ENV_SNAPSHOT_CACHE_TTL_MS = 1_000;

let cachedProcessEnvSnapshot: {
	raw: Record<string, string>;
	safe: Record<string, string>;
	expiresAt: number;
} | null = null;
let cachedMacosSystemCertAvailable: boolean | null = null;

function startLocaleProbe(): void {
	if (cachedUtf8Locale || localeProbeInFlight) return;
	localeProbeInFlight = true;

	exec(
		"locale 2>/dev/null | grep LANG= | cut -d= -f2",
		{ encoding: "utf-8", timeout: 1000 },
		(error, stdout) => {
			localeProbeInFlight = false;
			if (error) return;
			const result = stdout.trim();
			if (result.includes("UTF-8")) {
				cachedUtf8Locale = result;
			}
		},
	);
}

/**
 * Current hook protocol version.
 * Increment when making breaking changes to the hook protocol.
 * The server logs this for debugging version mismatches.
 */
export const HOOK_PROTOCOL_VERSION = "2";

export const FALLBACK_SHELL = os.platform() === "win32" ? "cmd.exe" : "/bin/sh";
export const SHELL_CRASH_THRESHOLD_MS = 1000;

type DefaultShellModuleShape =
	| string
	| {
			default?: string;
	  }
	| null
	| undefined;

export function normalizeDefaultShell(
	shellValue: DefaultShellModuleShape,
): string | null {
	if (typeof shellValue === "string" && shellValue.length > 0) {
		return shellValue;
	}

	if (
		shellValue &&
		typeof shellValue === "object" &&
		typeof shellValue.default === "string" &&
		shellValue.default.length > 0
	) {
		return shellValue.default;
	}

	return null;
}

export function getDefaultShell(): string {
	const resolvedDefaultShell = normalizeDefaultShell(defaultShell);
	if (resolvedDefaultShell) {
		return resolvedDefaultShell;
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

	if (cachedUtf8Locale) {
		return cachedUtf8Locale;
	}

	startLocaleProbe();
	cachedUtf8Locale = "en_US.UTF-8";
	return cachedUtf8Locale;
}

/**
 * Precompute expensive locale fallback resolution early in app startup so
 * the first terminal create/attach path does not pay a synchronous probe.
 */
export function prewarmTerminalEnv(): void {
	const rawBaseEnv = sanitizeEnv(process.env) || {};
	const directLocale = rawBaseEnv.LANG?.includes("UTF-8")
		? rawBaseEnv.LANG
		: rawBaseEnv.LC_ALL?.includes("UTF-8")
			? rawBaseEnv.LC_ALL
			: null;
	if (directLocale) {
		cachedUtf8Locale = directLocale;
		return;
	}
	startLocaleProbe();
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

function getProcessEnvSnapshot(): {
	raw: Record<string, string>;
	safe: Record<string, string>;
} {
	const now = Date.now();
	if (cachedProcessEnvSnapshot && cachedProcessEnvSnapshot.expiresAt > now) {
		return cachedProcessEnvSnapshot;
	}

	const raw = sanitizeEnv(process.env) || {};
	const safe = buildSafeEnv(raw);
	cachedProcessEnvSnapshot = {
		raw,
		safe,
		expiresAt: now + PROCESS_ENV_SNAPSHOT_CACHE_TTL_MS,
	};
	return cachedProcessEnvSnapshot;
}

function hasMacosSystemCertBundle(): boolean {
	if (cachedMacosSystemCertAvailable !== null) {
		return cachedMacosSystemCertAvailable;
	}

	cachedMacosSystemCertAvailable = fs.existsSync(MACOS_SYSTEM_CERT_FILE);
	return cachedMacosSystemCertAvailable;
}

export function resetTerminalEnvCachesForTests(): void {
	cachedProcessEnvSnapshot = null;
	cachedMacosSystemCertAvailable = null;
	cachedUtf8Locale = null;
	localeProbeInFlight = false;
	cachedRelayApiKey = null;
	relayMcpConfigCache.clear();
	relayAgentNameCounters.clear();
	relayAgentRegistrations.clear();
	relayAgentRegistrationPromises.clear();
}

function detectCliTypeFromShell(shell: string): string {
	const shellBasename = path.basename(shell).replace(/\.exe$/i, "").toLowerCase();
	switch (shellBasename) {
		case "":
		case "bash":
		case "cmd":
		case "fish":
		case "powershell":
		case "pwsh":
		case "sh":
		case "zsh":
			return "agent";
		default:
			return shellBasename;
	}
}

async function getOrRegisterRelayAgent(params: {
	tabId: string;
	shell: string;
}): Promise<{ name: string; token: string } | null> {
	const relayApiKey = cachedRelayApiKey ?? process.env.RELAY_API_KEY ?? null;
	if (!relayApiKey) return null;

	if (!cachedRelayApiKey) {
		cachedRelayApiKey = relayApiKey;
	}

	const existingRegistration = relayAgentRegistrations.get(params.tabId);
	if (existingRegistration) {
		return existingRegistration;
	}

	const inFlightRegistration = relayAgentRegistrationPromises.get(params.tabId);
	if (inFlightRegistration) {
		return inFlightRegistration;
	}

	const registrationPromise = (async () => {
		const name = generateAgentName(detectCliTypeFromShell(params.shell));
		const token = await registerRelayAgent(name);
		if (!token) return null;

		const registration = { name, token };
		relayAgentRegistrations.set(params.tabId, registration);
		return registration;
	})();

	relayAgentRegistrationPromises.set(params.tabId, registrationPromise);

	try {
		return await registrationPromise;
	} finally {
		relayAgentRegistrationPromises.delete(params.tabId);
	}
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

	// Shell initialization (required for agent wrapper PATH injection)
	"ZDOTDIR", // zsh config directory - used to source our wrapper
	"BASH_ENV", // bash startup file - used for non-interactive shells

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
	"RELAY_", // Agent Relay workspace/auth vars
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

export async function buildTerminalEnv(params: {
	shell: string;
	paneId: string;
	tabId: string;
	workspaceId: string;
	workspaceName?: string;
	workspacePath?: string;
	rootPath?: string;
	themeType?: "dark" | "light";
}): Promise<Record<string, string>> {
	const {
		shell,
		paneId,
		tabId,
		workspaceId,
		workspaceName,
		workspacePath,
		rootPath,
		themeType,
	} = params;

	// Get Electron's process.env and filter to only allowlisted safe vars
	// This prevents secrets and app config from leaking to user terminals
	const { raw: rawBaseEnv, safe: baseEnv } = getProcessEnvSnapshot();

	// shellEnv provides shell wrapper control variables (ZDOTDIR, BASH_ENV, etc.)
	// These configure how the shell initializes, not the user's actual environment
	const shellEnv = getShellEnv(shell);
	const locale = getLocale(rawBaseEnv);

	// COLORFGBG: "foreground;background" ANSI color indices — TUI apps use this to detect light/dark
	const colorFgBg = themeType === "light" ? "0;15" : "15;0";
	const relayAgentRegistration = await getOrRegisterRelayAgent({ tabId, shell });

	const terminalEnv: Record<string, string> = {
		...baseEnv,
		...shellEnv,
		// Relay workspace key for agent-to-agent communication
		...(cachedRelayApiKey
			? { RELAY_API_KEY: cachedRelayApiKey }
			: process.env.RELAY_API_KEY
				? { RELAY_API_KEY: process.env.RELAY_API_KEY }
				: {}),
		TERM_PROGRAM: "Superset",
		TERM_PROGRAM_VERSION: process.env.npm_package_version || "1.0.0",
		COLORTERM: "truecolor",
		COLORFGBG: colorFgBg,
		LANG: locale,
		SUPERSET_PANE_ID: paneId,
		SUPERSET_TAB_ID: tabId,
		SUPERSET_WORKSPACE_ID: workspaceId,
		SUPERSET_WORKSPACE_NAME: workspaceName || "",
		SUPERSET_WORKSPACE_PATH: workspacePath || "",
		SUPERSET_ROOT_PATH: rootPath || "",
		SUPERSET_PORT: String(env.DESKTOP_NOTIFICATIONS_PORT),
		// Environment identifier for dev/prod separation
		SUPERSET_ENV: env.NODE_ENV === "development" ? "development" : "production",
		// Hook protocol version for forward compatibility
		SUPERSET_HOOK_VERSION: HOOK_PROTOCOL_VERSION,
		...(relayAgentRegistration
			? {
					RELAY_AGENT_NAME: relayAgentRegistration.name,
					RELAY_AGENT_TOKEN: relayAgentRegistration.token,
					RELAY_SKIP_BOOTSTRAP: "1",
				}
			: {}),
	};

	// Write .mcp.json with shared relay key so Claude's MCP tools
	// use the same workspace as all other agents.
	if (workspacePath) {
		ensureRelayMcpConfig(workspacePath, {
			RELAY_AGENT_NAME: terminalEnv.RELAY_AGENT_NAME,
			RELAY_AGENT_TOKEN: terminalEnv.RELAY_AGENT_TOKEN,
			RELAY_SKIP_BOOTSTRAP: terminalEnv.RELAY_SKIP_BOOTSTRAP,
		});
	}

	delete terminalEnv.GOOGLE_API_KEY;

	// Electron child processes can't access macOS Keychain for TLS cert verification,
	// causing "x509: OSStatus -26276" in Go binaries like `gh`. File-based fallback.
	if (
		os.platform() === "darwin" &&
		!terminalEnv.SSL_CERT_FILE &&
		hasMacosSystemCertBundle()
	) {
		terminalEnv.SSL_CERT_FILE = MACOS_SYSTEM_CERT_FILE;
	}

	return terminalEnv;
}
