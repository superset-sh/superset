/**
 * Maps incoming event types to canonical lifecycle events.
 * Handles variations from different agent CLIs.
 *
 * Returns null for unknown events so callers can ignore safely
 * for forward compatibility.
 */
export function mapEventType(
	eventType: string | undefined,
): "Start" | "Stop" | "PermissionRequest" | null {
	if (!eventType) {
		return null;
	}
	if (eventType === "Start" || eventType === "UserPromptSubmit") {
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
