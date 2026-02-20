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
		eventType === "sessionStart" ||
		eventType === "userPromptSubmitted" ||
		eventType === "postToolUse"
	) {
		return "Start";
	}
	if (eventType === "PermissionRequest" || eventType === "preToolUse") {
		return "PermissionRequest";
	}
	if (
		eventType === "Stop" ||
		eventType === "agent-turn-complete" ||
		eventType === "AfterAgent" ||
		eventType === "sessionEnd"
	) {
		return "Stop";
	}
	return null;
}
