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
		eventType === "PostToolUseFailure"
	) {
		return "Start";
	}
	if (eventType === "PermissionRequest") {
		return "PermissionRequest";
	}
	if (eventType === "Stop" || eventType === "agent-turn-complete") {
		return "Stop";
	}
	return null;
}
