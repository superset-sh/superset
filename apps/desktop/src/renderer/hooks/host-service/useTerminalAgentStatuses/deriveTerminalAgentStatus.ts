import { deriveAgentSessionState } from "@superset/shared/agent-session-identity";
import type { PaneStatus } from "shared/tabs-types";

/**
 * Derive a terminal agent's UI status from its host binding.
 *
 * The event-type → liveness mapping is owned by
 * `@superset/shared/agent-session-identity`, the same derivation the CLI's
 * `agents get` contract serves; this adds only what is specific to a pane:
 * `permission` is deliberately not seen-gated — it's a live blocking state
 * that must show until the agent resolves it — and a finished turn the user
 * hasn't looked at yet becomes `review`.
 */
export function deriveTerminalAgentStatus({
	lastEventType,
	lastEventAt,
	lastSeenAt,
}: {
	lastEventType: string;
	lastEventAt: number;
	lastSeenAt: number | undefined;
}): PaneStatus {
	switch (deriveAgentSessionState({ lastEventType })) {
		case "working":
			return "working";
		case "awaiting-input":
			return "permission";
		case "failed":
			return "failed";
		default:
			return lastEventType === "Stop" && lastEventAt > (lastSeenAt ?? 0)
				? "review"
				: "idle";
	}
}
