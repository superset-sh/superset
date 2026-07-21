import type { TerminalAgentBinding } from "./types";

export type TerminalAgentStatus = "working" | "permission" | "idle" | "failed";

export function terminalAgentStatus(
	binding: Pick<TerminalAgentBinding, "lastEventType">,
): TerminalAgentStatus {
	switch (binding.lastEventType) {
		case "Start":
			return "working";
		case "PermissionRequest":
			return "permission";
		case "Failed":
			return "failed";
		default:
			return "idle";
	}
}
