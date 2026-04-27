/**
 * Runtime env stripping for v2 terminals.
 *
 * Denylist approach: the host-service base env is a shell-derived snapshot
 * plus explicit runtime additions from desktop. We strip the known additions
 * rather than allowlisting, because the shell snapshot should pass through
 * untouched (version managers, proxy config, etc.).
 */

/**
 * Exact keys injected by desktop into host-service.
 *
 * DESKTOP_* are exact keys (not prefixes) because DESKTOP_SESSION,
 * DESKTOP_STARTUP_ID etc. are legitimate Linux vars.
 */
const HOST_SERVICE_RUNTIME_KEYS = new Set([
	"AUTH_TOKEN",
	"CLOUD_API_URL",
	"DESKTOP_VITE_PORT",
	"HOST_CLIENT_ID",
	"HOST_NAME",
	"KEEP_ALIVE_AFTER_PARENT",
	"ORGANIZATION_ID",
]);

const NODE_APP_KEYS = new Set(["NODE_ENV", "NODE_OPTIONS", "NODE_PATH"]);

const STRIP_PREFIXES = [
	"npm_",
	"npm_config_",
	"ELECTRON_",
	"VITE_",
	"NEXT_PUBLIC_",
	"TURBO_",
	"HOST_",
];

const SUPERSET_KEEP_KEYS = new Set([
	"SUPERSET_HOME_DIR",
	"SUPERSET_AGENT_HOOK_PORT",
	"SUPERSET_AGENT_HOOK_VERSION",
]);

export function stripTerminalRuntimeEnv(
	baseEnv: Record<string, string>,
): Record<string, string> {
	const result: Record<string, string> = {};

	for (const [key, value] of Object.entries(baseEnv)) {
		if (HOST_SERVICE_RUNTIME_KEYS.has(key)) continue;
		if (NODE_APP_KEYS.has(key)) continue;
		if (STRIP_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
		if (key.startsWith("SUPERSET_") && !SUPERSET_KEEP_KEYS.has(key)) continue;

		result[key] = value;
	}

	return result;
}
