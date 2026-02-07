import type {
	ToolCallPart,
	ToolResultPart,
} from "@superset/durable-session/react";
import type { ToolDisplayState } from "@superset/ui/ai-elements/tool";

export function mapToolCallState(
	tc: ToolCallPart,
	result?: ToolResultPart,
): ToolDisplayState {
	if (result) {
		return result.error ? "output-error" : "output-available";
	}
	switch (tc.state) {
		case "awaiting-input":
		case "input-streaming":
			return "input-streaming";
		case "input-complete":
			return "input-available";
		case "approval-requested":
			return "approval-requested";
		case "approval-responded":
			return tc.output != null ? "output-available" : "approval-responded";
		default:
			return "input-available";
	}
}

export function mapApproval(approval?: ToolCallPart["approval"]) {
	if (!approval) return undefined;
	if (approval.approved === undefined) return { id: approval.id };
	return { id: approval.id, approved: approval.approved };
}

export function safeParseJson(str: string): Record<string, unknown> {
	try {
		return JSON.parse(str);
	} catch {
		return {};
	}
}
