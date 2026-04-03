import { buildWrapperScript, createWrapper } from "./agent-wrappers-common";

/**
 * Creates the Amp wrapper that preserves Superset's terminal environment.
 * Amp does not currently expose stable hook support, so this wrapper is a
 * pass-through binary shim only.
 */
export function createAmpWrapper(): void {
	const script = buildWrapperScript("amp", `exec "$REAL_BIN" "$@"`);
	createWrapper("amp", script);
}
