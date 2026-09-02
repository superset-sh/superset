import { msg } from "@lingui/core/macro";

// Stable marker in host-service's runTerminalAgent NOT_FOUND — present in
// both the pre-1.17 terse message and the current user-worded one.
const STALE_AGENT_ERROR_MARKER = "No host agent config matching";

export const STALE_AGENT_HELP = msg({
	message:
		"The agent this automation was set to run no longer exists on its host — the host's agents may have been reset or removed. Re-select an agent in the automation's settings.",
});

export function isStaleAgentError(error: string | null | undefined): boolean {
	return !!error && error.includes(STALE_AGENT_ERROR_MARKER);
}
