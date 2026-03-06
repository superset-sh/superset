export function mapEventType(
	eventType: string | undefined,
): "Start" | "Stop" | "PermissionRequest" | null {
	if (!eventType) {
		return null;
	}
	const normalized = eventType.trim();
	if (!normalized) {
		return null;
	}

	const lower = normalized.toLowerCase();

	if (
		lower === "start" ||
		lower === "userpromptsubmit" ||
		lower === "posttooluse" ||
		lower === "posttoolusefailure" ||
		lower === "beforeagent" ||
		lower === "aftertool" ||
		lower === "sessionstart" ||
		lower === "userpromptsubmitted"
	) {
		return "Start";
	}
	if (
		lower === "permissionrequest" ||
		lower === "pretooluse" ||
		lower === "permission_prompt" ||
		lower === "permissionprompt" ||
		lower === "elicitation_dialog" ||
		lower === "elicitationdialog"
	) {
		return "PermissionRequest";
	}
	if (
		lower === "stop" ||
		lower === "agent-turn-complete" ||
		lower === "afteragent" ||
		lower === "sessionend" ||
		lower === "idle_prompt" ||
		lower === "idleprompt" ||
		lower === "auth_success" ||
		lower === "authsuccess"
	) {
		return "Stop";
	}
	return null;
}
