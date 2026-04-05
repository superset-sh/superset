import { homedir } from "node:os";

/**
 * V2 Terminal Env Contract
 *
 * Builds a clean PTY environment for v2 workspace terminals.
 *
 * The host-service process env already contains the user's shell-derived
 * env (merged by the desktop app via getProcessEnvWithShellPath before
 * spawning host-service). This module strips Superset / Electron /
 * host-service internals and injects a small public terminal contract.
 *
 * Contract:
 *   TERM=xterm-256color
 *   TERM_PROGRAM=Superset
 *   TERM_PROGRAM_VERSION=<version>
 *   COLORTERM=truecolor
 *   LANG=<utf8 locale>
 *   PWD=<cwd>
 *
 * No legacy hook metadata (SUPERSET_PANE_ID, SUPERSET_TAB_ID,
 * SUPERSET_PORT, SUPERSET_HOOK_VERSION, etc.) is injected.
 */

/**
 * Prefixes of environment variables to strip from inherited process env.
 * These are Superset / Electron / build-system internals.
 */
const STRIPPED_PREFIXES = [
	"ELECTRON_",
	"SUPERSET_",
	"VITE_",
	"NEXT_PUBLIC_",
	"TURBO_",
	"npm_",
	"CHROME_",
];

/**
 * Specific environment variables to strip.
 * Host-service runtime config + Electron / Node internals.
 */
const STRIPPED_VARS = new Set([
	// Host-service runtime config (passed by HostServiceManager)
	"HOST_SERVICE_SECRET",
	"HOST_DB_PATH",
	"HOST_MIGRATIONS_PATH",
	"AUTH_TOKEN",
	"CLOUD_API_URL",
	"ORGANIZATION_ID",
	"DEVICE_CLIENT_ID",
	"DEVICE_NAME",
	"CORS_ORIGINS",
	"DESKTOP_VITE_PORT",
	// Electron / Node / Chromium internals
	"GOOGLE_API_KEY",
	"NODE_OPTIONS",
	"NODE_ENV",
	"NODE_PATH",
	"ORIGINAL_XDG_CURRENT_DESKTOP",
]);

/**
 * Strip Superset / Electron / host-service internal vars from the env.
 * Uses a denylist approach on the already shell-derived base env.
 */
export function stripInternalVars(
	env: Record<string, string>,
): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		if (STRIPPED_VARS.has(key)) continue;
		if (STRIPPED_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
		result[key] = value;
	}
	return result;
}

/**
 * Resolve a UTF-8 locale from the given env.
 */
function getLocale(env: Record<string, string>): string {
	if (env.LANG?.includes("UTF-8")) return env.LANG;
	if (env.LC_ALL?.includes("UTF-8")) return env.LC_ALL;
	return "en_US.UTF-8";
}

/**
 * Convert process.env to a Record<string, string> (drop undefined values).
 */
function sanitizeProcessEnv(): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (typeof value === "string") {
			result[key] = value;
		}
	}
	return result;
}

/**
 * Build the v2 terminal PTY environment.
 *
 * Reads from process.env (which already contains the user's shell env,
 * merged by the desktop app before spawning host-service), strips
 * internal vars, and injects the public terminal contract.
 */
export function buildV2TerminalEnv(params: {
	cwd: string;
	appVersion?: string;
}): Record<string, string> {
	const { cwd, appVersion } = params;
	const rawEnv = sanitizeProcessEnv();
	const baseEnv = stripInternalVars(rawEnv);
	const locale = getLocale(rawEnv);

	return {
		...baseEnv,
		TERM: "xterm-256color",
		TERM_PROGRAM: "Superset",
		TERM_PROGRAM_VERSION: appVersion || "1.0.0",
		COLORTERM: "truecolor",
		LANG: locale,
		HOME: rawEnv.HOME || homedir(),
		PWD: cwd,
	};
}
