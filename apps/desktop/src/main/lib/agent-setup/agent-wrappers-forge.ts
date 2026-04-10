import { buildWrapperScript, createWrapper } from "./agent-wrappers-common";

/**
 * Creates the Forge wrapper that preserves Superset's terminal environment.
 * Forge does not currently expose stable external hook support, so this wrapper
 * is a pass-through binary shim only.
 */
export function createForgeWrapper(): void {
	const script = buildWrapperScript("forge", `exec "$REAL_BIN" "$@"`);
	createWrapper("forge", script);
}
