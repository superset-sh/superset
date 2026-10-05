import { buildWrapperScript, createWrapper } from "./agent-wrappers-common";

export function createUfoWrapper(): void {
	createWrapper(
		"ufo",
		buildWrapperScript("ufo", 'exec "$REAL_BIN" "$@"', { agentId: "ufo" }),
	);
}
