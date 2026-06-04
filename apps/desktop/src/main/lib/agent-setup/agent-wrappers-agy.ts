import { buildWrapperScript, createWrapper } from "./agent-wrappers-common";

/**
 * Creates the Antigravity CLI wrapper that preserves Superset's terminal
 * environment and exports SUPERSET_AGENT_ID="agy" so the agent process
 * inherits the wrapper-level identity. When antigravity-cli ships a hook
 * system, hooks reading the parent-process identity will pick up "agy"
 * automatically.
 */
export function createAgyWrapper(): void {
	const script = buildWrapperScript("agy", `exec "$REAL_BIN" "$@"`, {
		agentId: "agy",
	});
	createWrapper("agy", script);
}
