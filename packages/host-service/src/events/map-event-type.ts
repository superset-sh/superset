/**
 * Normalized lifecycle event types broadcast over the WS event bus.
 *
 * - `Start` / `Stop`: per-turn working-state cadence — drives the working
 *   indicator and the completion chime.
 * - `PermissionRequest`: agent is blocked waiting for a tool/exec decision.
 * - `Attached` / `Detached`: session-lifetime signal — drives the pane icon
 *   binding only. NOT working state: SessionStart fires on agent boot when
 *   the agent is still idle waiting for input.
 */
export type AgentLifecycleEventType =
	| "Start"
	| "Stop"
	| "PermissionRequest"
	| "Attached"
	| "Detached";

export function mapEventType(
	eventType: string | undefined,
): AgentLifecycleEventType | null {
	if (!eventType) {
		return null;
	}
	if (
		eventType === "Attached" ||
		eventType === "attached" ||
		eventType === "SessionStart" ||
		eventType === "sessionStart" ||
		eventType === "session_start"
	) {
		return "Attached";
	}
	if (
		eventType === "Detached" ||
		eventType === "detached" ||
		eventType === "SessionEnd" ||
		eventType === "sessionEnd" ||
		eventType === "session_end"
	) {
		return "Detached";
	}
	if (
		eventType === "Start" ||
		eventType === "UserPromptSubmit" ||
		eventType === "PostToolUse" ||
		eventType === "PostToolUseFailure" ||
		eventType === "BeforeAgent" ||
		eventType === "AfterTool" ||
		eventType === "userPromptSubmitted" ||
		eventType === "user_prompt_submit" ||
		eventType === "postToolUse" ||
		eventType === "post_tool_use" ||
		eventType === "task_started"
	) {
		return "Start";
	}
	if (
		eventType === "PermissionRequest" ||
		eventType === "Notification" ||
		eventType === "PreToolUse" ||
		eventType === "preToolUse" ||
		eventType === "pre_tool_use" ||
		eventType === "exec_approval_request" ||
		eventType === "apply_patch_approval_request" ||
		eventType === "request_user_input"
	) {
		return "PermissionRequest";
	}
	if (
		eventType === "Stop" ||
		eventType === "stop" ||
		eventType === "agent-turn-complete" ||
		eventType === "AfterAgent" ||
		eventType === "task_complete"
	) {
		return "Stop";
	}
	return null;
}
