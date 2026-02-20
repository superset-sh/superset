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
		eventType === "AfterTool"
	) {
		return "Start";
	}
	if (eventType === "PermissionRequest") {
		return "PermissionRequest";
	}
	if (
		eventType === "Stop" ||
		eventType === "agent-turn-complete" ||
		eventType === "AfterAgent"
	) {
		return "Stop";
	}
	return null;
}
