import { execSync } from "node:child_process";
import os from "node:os";
import defaultShell from "default-shell";
import { PORTS } from "shared/constants";
import { getShellEnv } from "../agent-setup";

/** Fallback shell when primary shell fails quickly */
export const FALLBACK_SHELL = os.platform() === "win32" ? "cmd.exe" : "/bin/sh";

/** If shell exits within this time, consider it a crash and try fallback */
export const SHELL_CRASH_THRESHOLD_MS = 1000;

/**
 * Get the default shell using the default-shell package.
 * Falls back to manual detection if package fails.
 */
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

/**
 * Get the locale for the terminal environment.
 * Uses system locale if available, falls back to en_US.UTF-8.
 */
export function getLocale(baseEnv: Record<string, string>): string {
	// Check existing LANG first
	if (baseEnv.LANG?.includes("UTF-8")) {
		return baseEnv.LANG;
	}

	// Check LC_ALL
	if (baseEnv.LC_ALL?.includes("UTF-8")) {
		return baseEnv.LC_ALL;
	}

	// Try to detect system locale
	try {
		const result = execSync("locale 2>/dev/null | grep LANG= | cut -d= -f2", {
			encoding: "utf-8",
			timeout: 1000,
		}).trim();
		if (result?.includes("UTF-8")) {
			return result;
		}
	} catch {
		// Ignore errors - will use fallback
	}

	// Default to en_US.UTF-8 for maximum compatibility
	return "en_US.UTF-8";
}

/**
 * Sanitize environment variables, filtering out non-string values.
 */
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
 * Build the complete environment for a terminal session.
 */
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

	const baseEnv = sanitizeEnv(process.env) || {};
	const shellEnv = getShellEnv(shell);
	const locale = getLocale(baseEnv);

	const env: Record<string, string> = {
		...baseEnv,
		...shellEnv,
		// Terminal identification (like Hyper)
		TERM_PROGRAM: "Superset",
		TERM_PROGRAM_VERSION: process.env.npm_package_version || "1.0.0",
		// Enable truecolor support
		COLORTERM: "truecolor",
		// Locale for proper UTF-8 handling
		LANG: locale,
		// Superset-specific env vars
		SUPERSET_PANE_ID: paneId,
		SUPERSET_TAB_ID: tabId,
		SUPERSET_WORKSPACE_ID: workspaceId,
		SUPERSET_WORKSPACE_NAME: workspaceName || "",
		SUPERSET_WORKSPACE_PATH: workspacePath || "",
		SUPERSET_ROOT_PATH: rootPath || "",
		SUPERSET_PORT: String(PORTS.NOTIFICATIONS),
	};

	// Security: Remove Electron's default Google API key to prevent leakage
	delete env.GOOGLE_API_KEY;

	return env;
}
