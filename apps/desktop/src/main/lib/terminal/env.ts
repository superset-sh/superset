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
 * Prefixes for app/build-time variables that should not leak into user terminals.
 * These can cause cross-project config bleed and unexpected behavior.
 */
const APP_ENV_PREFIXES = [
	"VITE_",
	"MAIN_VITE_",
	"NEXT_PUBLIC_",
	"TURBO_",
	"ELECTRON_VITE_",
];

/**
 * Exact-match env vars from Electron/app that should not propagate to terminals.
 * - Behavior-changing: Can alter Node.js/Electron runtime behavior
 * - App secrets: Superset-specific credentials that shouldn't leak
 */
const APP_ENV_DENYLIST = [
	// Behavior-changing Node/Electron vars
	"NODE_ENV", // Causes npm/pnpm to skip devDependencies
	"NODE_OPTIONS", // Can inject flags, affect memory limits
	"NODE_PATH", // Silently changes module resolution
	"ELECTRON_RUN_AS_NODE", // Makes Electron behave as plain Node.js

	// Superset app secrets/config (exact matches)
	"GOOGLE_API_KEY",
	"GOOGLE_CLIENT_ID",
	"GH_CLIENT_ID",
	"SENTRY_DSN_DESKTOP",
];

/**
 * Remove Electron/app-specific env vars from the base environment.
 * This is applied BEFORE merging with shellEnv so user-provided values win.
 *
 * Why delete from baseEnv instead of final env?
 * - If user explicitly sets NODE_OPTIONS in their shell, we should respect it
 * - We only want to prevent Electron's internal env from bleeding through
 */
export function removeAppEnvVars(
	env: Record<string, string>,
): Record<string, string> {
	const cleaned = { ...env };

	// Remove exact-match denylist vars
	for (const key of APP_ENV_DENYLIST) {
		delete cleaned[key];
	}

	// Remove prefix-match vars (app/build-time leakage)
	for (const key of Object.keys(cleaned)) {
		if (APP_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) {
			delete cleaned[key];
		}
	}

	return cleaned;
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

	// Get Electron's process.env and remove app-specific vars BEFORE merging
	// This ensures user's shellEnv values will override (user wins)
	const rawBaseEnv = sanitizeEnv(process.env) || {};
	const baseEnv = removeAppEnvVars(rawBaseEnv);

	// shellEnv contains user's shell environment - these should win over baseEnv
	const shellEnv = getShellEnv(shell);
	const locale = getLocale(rawBaseEnv);

	const env: Record<string, string> = {
		...baseEnv,
		...shellEnv, // User's env wins over cleaned baseEnv
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
