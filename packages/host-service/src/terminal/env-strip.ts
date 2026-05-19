/**
 * Runtime env stripping for v2 terminals.
 *
 * Denylist approach: the host-service base env is the host-service process.env
 * (a passthrough of desktop main's env, which itself inherits user shell env
 * via launchctl/login + explicit additions when forking host-service). We
 * strip the desktop-injected runtime keys here; everything else — including
 * launchctl-set user creds (DD_API_KEY, OPENAI_API_KEY, …) — passes through.
 *
 * This is applied in two places: once on the env handed to the snapshot shell
 * (clean-shell-env.ts) and again on the snapshot's output before it reaches
 * any PTY (env.ts:88). The duplication is intentional defense-in-depth: rc
 * files can re-export anything, so we re-strip after the shell has run.
 */

/**
 * Exact keys injected by desktop into host-service.
 *
 * DESKTOP_* are exact keys (not prefixes) because DESKTOP_SESSION,
 * DESKTOP_STARTUP_ID etc. are legitimate Linux vars.
 */
const HOST_SERVICE_RUNTIME_KEYS = new Set([
	"AUTH_TOKEN",
	"SUPERSET_API_URL",
	"DESKTOP_VITE_PORT",
	"HOST_CLIENT_ID",
	"HOST_NAME",
	"KEEP_ALIVE_AFTER_PARENT",
	"ORGANIZATION_ID",
	// host-service-coordinator.ts:586-591 explicitly sets or deletes this when
	// spawning the host-service child. Treat it as desktop-injected, not user.
	"RELAY_URL",
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
