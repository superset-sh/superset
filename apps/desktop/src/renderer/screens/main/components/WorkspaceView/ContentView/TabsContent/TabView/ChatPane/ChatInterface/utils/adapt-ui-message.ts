import type { UIMessage } from "ai";
import {
	getToolOrDynamicToolName,
	isToolOrDynamicToolUIPart,
} from "ai";
import type { ChatMessage, MessagePart, ToolCallPart } from "../types";

/**
 * Map AI SDK v5 tool invocation state → ChatMessage ToolCallPart status.
 */
function mapToolStatus(
	state: string,
): ToolCallPart["status"] {
	switch (state) {
		case "input-streaming":
			return "streaming";
		case "input-available":
			return "calling";
		case "output-available":
		case "output-error":
			return "done";
		default:
			return "calling";
	}
}

/**
 * Convert a single AI SDK v5 message part → ChatMessage MessagePart[].
 *
 * Returns an array because some v5 parts (like reasoning) map to zero
 * ChatMessage parts, and future parts might map to multiple.
 */
function adaptPart(part: UIMessage["parts"][number]): MessagePart[] {
	if (part.type === "text") {
		return part.text ? [{ type: "text", text: part.text }] : [];
	}

	// Reasoning parts → text parts with a prefix (or skip if you prefer)
	if (part.type === "reasoning") {
		// Skip reasoning in the old rendering path — ChatMessage has no reasoning type
		return [];
	}

	// Tool parts: both ToolUIPart ("tool-<Name>") and DynamicToolUIPart ("dynamic-tool")
	if (isToolOrDynamicToolUIPart(part)) {
		const toolName = getToolOrDynamicToolName(part);
		const toolPart: ToolCallPart = {
			type: "tool-call",
			toolCallId: part.toolCallId,
			toolName,
			args: part.input,
			status: mapToolStatus(part.state),
			result: part.state === "output-available" ? part.output : undefined,
			isError: part.state === "output-error",
		};
		return [toolPart];
	}

	// Source URL, file, data, step-start parts — skip for the old rendering path
	return [];
}

/**
 * Convert an AI SDK v5 UIMessage → ChatMessage for the old rendering pipeline.
 *
 * This bridges `useChat().messages` (AI SDK v5 UIMessage[]) to the existing
 * MessageList/MessagePartsRenderer components which expect ChatMessage[].
 */
export function adaptUIMessage(msg: UIMessage): ChatMessage {
	return {
		id: msg.id,
		role: msg.role as "user" | "assistant",
		parts: msg.parts.flatMap(adaptPart),
	};
}

/**
 * Batch-convert AI SDK v5 UIMessage[] → ChatMessage[].
 */
export function adaptUIMessages(messages: UIMessage[]): ChatMessage[] {
	return messages.map(adaptUIMessage);
}
