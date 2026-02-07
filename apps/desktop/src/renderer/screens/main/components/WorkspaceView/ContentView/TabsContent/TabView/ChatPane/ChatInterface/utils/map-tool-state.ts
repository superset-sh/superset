import type {
	ToolCallPart,
	ToolResultPart,
} from "@superset/durable-session/react";
import type { ToolDisplayState } from "@superset/ui/ai-elements/tool";

/**
 * Map TanStack AI ToolCallPart state + optional ToolResultPart
 * to ToolDisplayState for UI components.
 */
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

/**
 * Map TanStack AI approval to the shape expected by UI Confirmation component.
 */
export function mapApproval(approval?: ToolCallPart["approval"]) {
	if (!approval) return undefined;
	if (approval.approved === undefined) return { id: approval.id };
	return { id: approval.id, approved: approval.approved };
}

/**
 * Safely parse a JSON string into an object. Returns empty object on failure.
 */
export function safeParseJson(str: string): Record<string, unknown> {
	try {
		return JSON.parse(str);
	} catch {
		return {};
	}
}
