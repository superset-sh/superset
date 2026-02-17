import type { ToolDisplayState } from "@superset/ui/ai-elements/tool";
import type { ToolCallPart, WsToolState } from "../types";

export function toToolDisplayState(part: ToolCallPart): ToolDisplayState {
	if (part.status === "streaming") return "input-streaming";
	if (part.status === "calling") return "input-complete";
	if (part.isError) return "output-error";
	if (part.result != null) return "output-available";
	return "input-available";
}

export function getArgs(part: ToolCallPart): Record<string, unknown> {
	if (typeof part.args === "object" && part.args !== null) {
		return part.args as Record<string, unknown>;
	}
	if (typeof part.args === "string") {
		try {
			return JSON.parse(part.args);
		} catch {
			return {};
		}
	}
	return {};
}

export function getResult(part: ToolCallPart): Record<string, unknown> {
	if (typeof part.result === "object" && part.result !== null) {
		return part.result as Record<string, unknown>;
	}
	if (typeof part.result === "string") {
		try {
			return JSON.parse(part.result);
		} catch {
			return { text: part.result };
		}
	}
	return {};
}

export function toWsToolState(part: ToolCallPart): WsToolState {
	if (part.status === "streaming") return "input-streaming";
	if (part.status === "calling") return "input-available";
	if (part.isError) return "output-error";
	if (part.result != null) return "output-available";
	return "input-available";
}
