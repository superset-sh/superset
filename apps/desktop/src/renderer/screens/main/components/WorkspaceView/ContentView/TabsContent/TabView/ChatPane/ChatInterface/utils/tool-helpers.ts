import type { ToolDisplayState } from "@superset/ui/ai-elements/tool";
import type { UIMessage } from "ai";

// Extract tool part type from UIMessage
type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

export type { ToolPart };

export function toToolDisplayState(part: ToolPart): ToolDisplayState {
	switch (part.state) {
		case "input-streaming":
			return "input-streaming";
		case "input-available":
			return "input-complete";
		case "output-error":
			return "output-error";
		case "output-available":
			return "output-available";
		default:
			return "input-available";
	}
}

export function getArgs(part: ToolPart): Record<string, unknown> {
	const input = part.input;
	if (typeof input === "object" && input !== null) {
		return input as Record<string, unknown>;
	}
	if (typeof input === "string") {
		try {
			return JSON.parse(input);
		} catch {
			return {};
		}
	}
	return {};
}

export function getResult(part: ToolPart): Record<string, unknown> {
	const output = part.output;
	if (typeof output === "object" && output !== null) {
		return output as Record<string, unknown>;
	}
	if (typeof output === "string") {
		try {
			return JSON.parse(output);
		} catch {
			return { text: output };
		}
	}
	return {};
}

type ToolStateUnion =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

// Map part.state to the 4-value union expected by UI tool components
export function toWsToolState(part: ToolPart): ToolStateUnion {
	switch (part.state) {
		case "input-streaming":
			return "input-streaming";
		case "output-available":
			return "output-available";
		case "output-error":
			return "output-error";
		default:
			return "input-available";
	}
}
