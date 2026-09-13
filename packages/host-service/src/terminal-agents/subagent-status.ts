import type { SubagentHarness } from "./subagent-harnesses";
import type { TerminalSubagentStatus } from "./types";

/** Events where the child is blocked on the user rather than working. */
const WAITING_EVENTS = new Set(["PermissionRequest", "Notification"]);

/**
 * The child's status after one hook event. Every event is a full statement
 * of where the child is, so the previous status never carries over: a tool
 * event after a permission request means the request was answered.
 */
export function deriveSubagentStatus(
	eventType: string,
	harness: Pick<SubagentHarness, "isStopEvent">,
): TerminalSubagentStatus {
	if (harness.isStopEvent(eventType)) return "completed";
	if (WAITING_EVENTS.has(eventType)) return "waiting";
	return "working";
}
