import fs from "node:fs";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	removeOwnedFileIfMarked,
} from "./agent-wrappers-common";
import { getTemplatePath } from "./config";
import { getHooksDir } from "./paths";
import { writeFileIfChanged } from "./write-file-if-changed";

export const PRIME_AGENT_EXTENSION_FILE = "prime-agent-notify.mjs";

/**
 * Parameters: None; resolves the current Superset home.
 * What it does: Keeps the extension private to this Superset installation, not global discovery.
 * Output: Absolute managed extension path.
 */
export function getPrimeAgentExtensionPath(): string {
	return path.join(getHooksDir(), PRIME_AGENT_EXTENSION_FILE);
}

/**
 * Parameters: None.
 * What it does: Reads the bundled extension without capturing terminal identity at install time.
 * Output: Extension source; throws if the bundled template is unavailable.
 */
export function getPrimeAgentExtensionContent(): string {
	return fs.readFileSync(getTemplatePath(PRIME_AGENT_EXTENSION_FILE), "utf8");
}

/**
 * Parameters: None.
 * What it does: Installs the managed extension; existing daemon sessions need a fresh session to load it.
 * Output: Writes the extension only when its content or mode changes.
 */
export function createPrimeAgentExtension(): void {
	const changed = writeFileIfChanged(
		getPrimeAgentExtensionPath(),
		getPrimeAgentExtensionContent(),
		0o644,
	);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Prime Agent extension`,
	);
}

/**
 * Parameters: None.
 * What it does: Captures launch identity in a private bridge because daemon reuse does not forward SUPERSET variables. Management commands bypass the bridge.
 * Output: Installs a launcher that reaps unused bridges after client exit and preserves loaded bridges for daemon sessions.
 */
export function createPrimeAgentWrapper(): void {
	const extensionPath = getPrimeAgentExtensionPath();
	const script = buildWrapperScript(
		"prime-agent",
		`case "$1" in
  help|agents|list|sessions|attach|stop|rename|send|schedule|status|doctor|incident|shutdown|mcp|package|update|model|session|config|--help|-h|--version|-v)
    exec "$REAL_BIN" "$@" ;;
esac
if [ -n "$SUPERSET_TERMINAL_ID" ] && [ -f '${extensionPath.replaceAll("'", "'\"'\"'")}' ]; then
  _superset_prime_bridge_dir="$(mktemp -d "$SUPERSET_HOME_DIR/hooks/prime-agent-XXXXXXXX")"
  if [ -n "$_superset_prime_bridge_dir" ] && node -e '
    const fs = require("node:fs");
    const env = Object.fromEntries([
      "SUPERSET_TERMINAL_ID", "SUPERSET_TAB_ID", "SUPERSET_PANE_ID",
      "SUPERSET_WORKSPACE_ID", "SUPERSET_HOME_DIR", "SUPERSET_HOST_AGENT_HOOK_URL",
      "SUPERSET_AGENT_LAUNCH_ID", "SUPERSET_ENV", "SUPERSET_PORT",
    ].map((key) => [key, process.env[key] || ""]));
    env.SUPERSET_PRIME_BRIDGE_PATH = process.argv[1];
    fs.writeFileSync(process.argv[1],
      "import extension from " + JSON.stringify(process.argv[2]) + ";\\n" +
      "export default (pi) => extension(pi, " + JSON.stringify(env) + ");\\n",
      { mode: 0o600 });
  ' "$_superset_prime_bridge_dir/bridge.mjs" '${extensionPath.replaceAll("'", "'\"'\"'")}' ; then
    trap 'if [ ! -f "$_superset_prime_bridge_dir/bridge.mjs.loaded" ]; then
      rm -f "$_superset_prime_bridge_dir/bridge.mjs"
      rmdir "$_superset_prime_bridge_dir" 2>/dev/null || true
    fi' EXIT
    "$REAL_BIN" --extension "$_superset_prime_bridge_dir/bridge.mjs" "$@"
    exit $?
  fi
  if [ -n "$_superset_prime_bridge_dir" ]; then
    rm -f "$_superset_prime_bridge_dir/bridge.mjs"
    rmdir "$_superset_prime_bridge_dir" 2>/dev/null || true
  fi
fi
exec "$REAL_BIN" "$@"`,
		{ agentId: "prime-agent" },
	);
	createWrapper("prime-agent", script);
}

/**
 * Parameters: None.
 * What it does: Revokes the wrapper's extension entrypoint without touching user extensions or active bridges.
 * Output: Removes only a Superset-marked extension; missing files are harmless.
 */
export function removePrimeAgentExtension(): void {
	removeOwnedFileIfMarked(
		getPrimeAgentExtensionPath(),
		"// Superset Prime Agent extension",
		"Prime Agent extension",
	);
}
