import { execSync } from "node:child_process";
import os from "node:os";
import defaultShell from "default-shell";
import { PORTS } from "shared/constants";
import { getShellEnv } from "../agent-setup";

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

	delete env.GOOGLE_API_KEY;

	return env;
}
