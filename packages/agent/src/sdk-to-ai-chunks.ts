/**
 * Converts Claude Agent SDK `SDKMessage` objects to TanStack AI `StreamChunk` (AG-UI events).
 *
 * Handled AG-UI events:
 * - TEXT_MESSAGE_CONTENT  — text token streaming
 * - TOOL_CALL_START       — tool invocation begins
 * - TOOL_CALL_ARGS        — streaming tool arguments
 * - TOOL_CALL_END         — tool call complete (with optional result)
 * - STEP_FINISHED         — thinking/reasoning content (incremental delta)
 * - RUN_FINISHED          — agent turn complete
 * - RUN_ERROR             — error during execution
 */

import { createTextSegmentEnricher } from "@superset/durable-session";
import type { StreamChunk } from "@tanstack/ai";

interface SDKPartialAssistantMessage {
	type: "stream_event";
	event: BetaRawMessageStreamEvent;
	parent_tool_use_id: string | null;
	uuid: string;
	session_id: string;
}

interface SDKUserMessage {
	type: "user";
	message: {
		content: string | Array<{ type: string; [key: string]: unknown }>;
	};
	parent_tool_use_id: string | null;
	session_id: string;
}

interface SDKResultMessage {
	type: "result";
	subtype: string;
	duration_ms: number;
	num_turns: number;
	stop_reason: string | null;
	total_cost_usd: number;
	usage: { input_tokens: number; output_tokens: number };
	session_id: string;
}

interface SDKSystemMessage {
	type: "system";
	subtype: string;
	session_id: string;
}

type SDKMessage =
	| SDKPartialAssistantMessage
	| SDKUserMessage
	| SDKResultMessage
	| SDKSystemMessage
	| { type: string; [key: string]: unknown };

type BetaRawMessageStreamEvent =
	| { type: "message_start"; message: { id: string; model: string } }
	| {
			type: "message_delta";
			delta: { stop_reason?: string };
			usage?: { output_tokens: number };
	  }
	| { type: "message_stop" }
	| {
			type: "content_block_start";
			index: number;
			content_block: ContentBlock;
	  }
	| {
			type: "content_block_delta";
			index: number;
			delta: ContentBlockDelta;
	  }
	| { type: "content_block_stop"; index: number };

type ContentBlock =
	| { type: "text"; text: string }
	| { type: "tool_use"; id: string; name: string; input: unknown }
	| { type: "thinking"; thinking: string; signature: string }
	| { type: "redacted_thinking"; data: string }
	| { type: string; [key: string]: unknown };

type ContentBlockDelta =
	| { type: "text_delta"; text: string }
	| { type: "input_json_delta"; partial_json: string }
	| { type: "thinking_delta"; thinking: string }
	| { type: "signature_delta"; signature: string }
	| { type: "citations_delta"; [key: string]: unknown };

interface ActiveBlock {
	type: "text" | "tool_use" | "thinking" | "other";
	toolCallId?: string;
	toolName?: string;
	argsAccumulator?: string;
}

export interface ConversionState {
	activeBlocks: Map<number, ActiveBlock>;
	messageId: string;
	runId: string;
}

export function createConverter(): {
	state: ConversionState;
	convert: (message: SDKMessage) => StreamChunk[];
} {
	const state: ConversionState = {
		activeBlocks: new Map(),
		messageId: crypto.randomUUID(),
		runId: crypto.randomUUID(),
	};

	const enrichChunk = createTextSegmentEnricher();

	return {
		state,
		convert(message: SDKMessage): StreamChunk[] {
			return convertMessage(state, message).map((chunk) =>
				enrichChunk(chunk as StreamChunk & { [key: string]: unknown }),
			);
		},
	};
}

function convertMessage(
	state: ConversionState,
	message: SDKMessage,
): StreamChunk[] {
	switch (message.type) {
		case "stream_event":
			return handleStreamEvent(
				state,
				(message as SDKPartialAssistantMessage).event,
			);

		case "user":
			return handleUserMessage(message as SDKUserMessage);

		case "assistant":
			// Content already streamed via stream_event; skip the full message.
			return [];

		case "result":
			return handleResultMessage(state, message as SDKResultMessage);

		default:
			return [];
	}
}

function handleStreamEvent(
	state: ConversionState,
	event: BetaRawMessageStreamEvent,
): StreamChunk[] {
	const now = Date.now();

	switch (event.type) {
		case "content_block_start":
			return handleContentBlockStart(state, event.index, event.content_block);

		case "content_block_delta":
			return handleContentBlockDelta(state, event.index, event.delta, now);

		case "content_block_stop":
			return handleContentBlockStop(state, event.index, now);

		default:
			return [];
	}
}

function handleContentBlockStart(
	state: ConversionState,
	index: number,
	block: ContentBlock,
): StreamChunk[] {
	const now = Date.now();

	switch (block.type) {
		case "text": {
			state.activeBlocks.set(index, { type: "text" });
			return [];
		}

		case "tool_use": {
			const toolBlock = block as {
				type: "tool_use";
				id: string;
				name: string;
			};
			state.activeBlocks.set(index, {
				type: "tool_use",
				toolCallId: toolBlock.id,
				toolName: toolBlock.name,
				argsAccumulator: "",
			});
			return [
				{
					type: "TOOL_CALL_START",
					toolCallId: toolBlock.id,
					toolName: toolBlock.name,
					index,
					timestamp: now,
				} satisfies StreamChunk,
			];
		}

		case "thinking": {
			const stepId = `thinking-${index}`;
			state.activeBlocks.set(index, { type: "thinking" });
			return [
				{
					type: "STEP_STARTED",
					stepId,
					stepType: "thinking",
					timestamp: now,
				} satisfies StreamChunk,
			];
		}

		default: {
			state.activeBlocks.set(index, { type: "other" });
			return [];
		}
	}
}

function handleContentBlockDelta(
	state: ConversionState,
	index: number,
	delta: ContentBlockDelta,
	now: number,
): StreamChunk[] {
	const block = state.activeBlocks.get(index);

	switch (delta.type) {
		case "text_delta": {
			return [
				{
					type: "TEXT_MESSAGE_CONTENT",
					messageId: state.messageId,
					delta: delta.text,
					timestamp: now,
				} satisfies StreamChunk,
			];
		}

		case "input_json_delta": {
			if (!block || block.type !== "tool_use" || !block.toolCallId) {
				return [];
			}
			block.argsAccumulator =
				(block.argsAccumulator ?? "") + delta.partial_json;
			return [
				{
					type: "TOOL_CALL_ARGS",
					toolCallId: block.toolCallId,
					delta: delta.partial_json,
					args: block.argsAccumulator,
					timestamp: now,
				} satisfies StreamChunk,
			];
		}

		case "thinking_delta": {
			const stepId = `thinking-${index}`;
			return [
				{
					type: "STEP_FINISHED",
					stepId,
					delta: delta.thinking,
					timestamp: now,
				} satisfies StreamChunk,
			];
		}

		default:
			return [];
	}
}

function handleContentBlockStop(
	state: ConversionState,
	index: number,
	now: number,
): StreamChunk[] {
	const block = state.activeBlocks.get(index);
	state.activeBlocks.delete(index);

	if (!block) return [];

	if (block.type === "tool_use" && block.toolCallId && block.toolName) {
		let parsedInput: unknown;
		try {
			parsedInput = JSON.parse(block.argsAccumulator || "{}");
		} catch (parseErr) {
			console.warn(
				"[sdk-to-ai-chunks] Failed to parse tool args for",
				block.toolName,
				":",
				parseErr,
			);
			parsedInput = {};
		}

		return [
			{
				type: "TOOL_CALL_END",
				toolCallId: block.toolCallId,
				toolName: block.toolName,
				input: parsedInput,
				timestamp: now,
			} satisfies StreamChunk,
		];
	}

	return [];
}

function handleUserMessage(message: SDKUserMessage): StreamChunk[] {
	if (!message.message) return [];
	const content = message.message.content;
	if (typeof content === "string" || !Array.isArray(content)) {
		return [];
	}

	const now = Date.now();
	const chunks: StreamChunk[] = [];

	for (const block of content) {
		if (block.type === "tool_result") {
			const toolResult = block as {
				type: "tool_result";
				tool_use_id: string;
				content?:
					| string
					| Array<{ type: string; text?: string; [key: string]: unknown }>;
				is_error?: boolean;
			};

			let resultText: string;
			if (typeof toolResult.content === "string") {
				resultText = toolResult.content;
			} else if (Array.isArray(toolResult.content)) {
				resultText = toolResult.content
					.filter(
						(b): b is { type: string; text: string } =>
							b.type === "text" && typeof b.text === "string",
					)
					.map((b) => b.text)
					.join("\n");
			} else {
				resultText = "";
			}

			chunks.push({
				type: "TOOL_CALL_END",
				toolCallId: toolResult.tool_use_id,
				toolName: "",
				result: resultText,
				timestamp: now,
			} satisfies StreamChunk);
		}
	}

	return chunks;
}

function handleResultMessage(
	state: ConversionState,
	message: SDKResultMessage,
): StreamChunk[] {
	const now = Date.now();
	const chunks: StreamChunk[] = [];

	if (message.subtype?.startsWith("error")) {
		chunks.push({
			type: "TEXT_MESSAGE_CONTENT",
			messageId: state.messageId,
			delta: `Error: ${message.subtype}`,
			timestamp: now,
		} satisfies StreamChunk);
		chunks.push({
			type: "RUN_ERROR",
			runId: state.runId,
			error: {
				message: `Claude agent error: ${message.subtype}`,
				code: message.subtype,
			},
			timestamp: now,
		} satisfies StreamChunk);
		return chunks;
	}

	const finishReason =
		message.stop_reason === "end_turn" ||
		message.stop_reason === "stop_sequence"
			? "stop"
			: message.stop_reason === "max_tokens"
				? "length"
				: message.stop_reason === "tool_use"
					? "tool_calls"
					: "stop";

	chunks.push({
		type: "RUN_FINISHED",
		runId: state.runId,
		finishReason: finishReason as "stop" | "length" | "tool_calls",
		usage: message.usage
			? {
					promptTokens: message.usage.input_tokens,
					completionTokens: message.usage.output_tokens,
					totalTokens: message.usage.input_tokens + message.usage.output_tokens,
				}
			: undefined,
		timestamp: now,
	} satisfies StreamChunk);

	return chunks;
}
