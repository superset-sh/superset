import type { PaneStatus } from "shared/tabs-types";

/**
 * Derive a terminal agent's UI status from its host binding. `permission` is
 * deliberately not seen-gated — it's a live blocking state that must show
 * until the agent resolves it.
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
	if (lastEventType === "Start") return "working";
	if (lastEventType === "PermissionRequest") return "permission";
	if (lastEventType === "Failed") return "failed";
	if (lastEventType === "Stop") {
		return lastEventAt > (lastSeenAt ?? 0) ? "review" : "idle";
	}
	return "idle";
}
