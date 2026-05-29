// Session-lifetime events (SessionStart/SessionEnd and aliases) are
// intentionally NOT mapped here. They fire when an agent attaches to / detaches
// from a terminal — the agent is idle waiting for input, not generating —
// so flipping the pane to "working" on SessionStart leaves the spinner stuck
// until the first real per-turn Stop. v1 has no Attached/Detached state to
// map to, so let these return null and rely on per-turn events
// (UserPromptSubmit/Start → Stop/AfterAgent/task_complete) for the working
// indicator, and on terminal-exit for stuck-state cleanup.
export function mapEventType(
	eventType: string | undefined,
): "Start" | "Stop" | "PermissionRequest" | null {
	if (!eventType) {
		return null;
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
