import { randomUUID } from "node:crypto";
import type { ModelProviderProtocol } from "../db/schema";
import { decodeProviderModelRef } from "../model-providers/model-ref";

export interface AnthropicMessageBody {
	model: string;
	system?: unknown;
	messages?: unknown;
	max_tokens?: unknown;
	temperature?: unknown;
	top_p?: unknown;
	stop_sequences?: unknown;
	stream?: unknown;
	tools?: unknown;
	tool_choice?: unknown;
}

interface JsonRecord {
	[key: string]: unknown;
}

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTextContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((block) => {
			if (!isRecord(block)) return "";
			if (block.type === "text" && typeof block.text === "string") {
				return block.text;
			}
			if (block.type === "tool_result") {
				return normalizeTextContent(block.content);
			}
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
	return isRecord(value) ? value : {};
}

function toOpenAITools(tools: unknown): unknown[] | undefined {
	if (!Array.isArray(tools)) return undefined;
	const mapped = tools
		.filter(isRecord)
		.map((tool) => ({
			type: "function",
			function: {
				name: typeof tool.name === "string" ? tool.name : "",
				description:
					typeof tool.description === "string" ? tool.description : undefined,
				parameters: normalizeJsonObject(tool.input_schema),
			},
		}))
		.filter((tool) => tool.function.name.length > 0);
	return mapped.length > 0 ? mapped : undefined;
}

function toOpenAIToolChoice(toolChoice: unknown): unknown {
	if (!isRecord(toolChoice)) return toolChoice;
	if (toolChoice.type === "auto" || toolChoice.type === "any") return "auto";
	if (toolChoice.type === "tool" && typeof toolChoice.name === "string") {
		return { type: "function", function: { name: toolChoice.name } };
	}
	return undefined;
}

function anthropicMessageToOpenAIMessages(
	body: AnthropicMessageBody,
): unknown[] {
	const messages: unknown[] = [];
	const systemText = normalizeTextContent(body.system);
	if (systemText) messages.push({ role: "system", content: systemText });

	if (!Array.isArray(body.messages)) return messages;
	for (const message of body.messages) {
		if (!isRecord(message) || typeof message.role !== "string") continue;
		const content = message.content;

		if (message.role === "assistant" && Array.isArray(content)) {
			const text = normalizeTextContent(content);
			const toolCalls = content
				.filter(isRecord)
				.filter((block) => block.type === "tool_use")
				.map((block) => ({
					id: typeof block.id === "string" ? block.id : randomUUID(),
					type: "function",
					function: {
						name: typeof block.name === "string" ? block.name : "",
						arguments: JSON.stringify(normalizeJsonObject(block.input)),
					},
				}))
				.filter((toolCall) => toolCall.function.name.length > 0);
			messages.push({
				role: "assistant",
				content: text || null,
				...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
			});
			continue;
		}

		if (message.role === "user" && Array.isArray(content)) {
			const toolResults = content
				.filter(isRecord)
				.filter((block) => block.type === "tool_result");
			for (const block of toolResults) {
				messages.push({
					role: "tool",
					tool_call_id:
						typeof block.tool_use_id === "string"
							? block.tool_use_id
							: "tool_result",
					content: normalizeTextContent(block.content),
				});
			}
			const text = normalizeTextContent(
				content.filter(
					(block) => !isRecord(block) || block.type !== "tool_result",
				),
			);
			if (text) messages.push({ role: "user", content: text });
			continue;
		}

		messages.push({
			role: message.role === "assistant" ? "assistant" : "user",
			content: normalizeTextContent(content),
		});
	}
	return messages;
}

export function resolveUpstreamModelId(model: string): string {
	return decodeProviderModelRef(model)?.modelId ?? model;
}

export function buildOpenAIChatRequest(body: AnthropicMessageBody): JsonRecord {
	const tools = toOpenAITools(body.tools);
	const toolChoice = toOpenAIToolChoice(body.tool_choice);
	return {
		model: resolveUpstreamModelId(body.model),
		messages: anthropicMessageToOpenAIMessages(body),
		max_tokens: body.max_tokens,
		temperature: body.temperature,
		top_p: body.top_p,
		stop: body.stop_sequences,
		stream: false,
		...(tools ? { tools } : {}),
		...(toolChoice ? { tool_choice: toolChoice } : {}),
	};
}

export function buildOpenAIResponsesRequest(
	body: AnthropicMessageBody,
): JsonRecord {
	const messages = anthropicMessageToOpenAIMessages(body);
	const input = messages
		.map((message) => (isRecord(message) ? message.content : ""))
		.filter((content): content is string => typeof content === "string")
		.join("\n\n");
	const system = messages.find(
		(message) => isRecord(message) && message.role === "system",
	);
	return {
		model: resolveUpstreamModelId(body.model),
		input,
		instructions:
			isRecord(system) && typeof system.content === "string"
				? system.content
				: undefined,
		max_output_tokens: body.max_tokens,
		temperature: body.temperature,
		top_p: body.top_p,
		stream: false,
	};
}

function extractOpenAIChatContent(parsed: unknown): {
	text: string;
	toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
	usage: { input_tokens: number; output_tokens: number };
} {
	const first =
		isRecord(parsed) && Array.isArray(parsed.choices)
			? parsed.choices.find(isRecord)
			: null;
	const message =
		isRecord(first) && isRecord(first.message) ? first.message : {};
	const text = normalizeTextContent(message.content);
	const toolUses = Array.isArray(message.tool_calls)
		? message.tool_calls
				.filter(isRecord)
				.map((call) => {
					const fn = isRecord(call.function) ? call.function : {};
					let input: Record<string, unknown> = {};
					if (typeof fn.arguments === "string") {
						try {
							input = normalizeJsonObject(JSON.parse(fn.arguments) as unknown);
						} catch {}
					}
					return {
						id: typeof call.id === "string" ? call.id : randomUUID(),
						name: typeof fn.name === "string" ? fn.name : "",
						input,
					};
				})
				.filter((toolUse) => toolUse.name.length > 0)
		: [];
	const usage = isRecord(parsed) && isRecord(parsed.usage) ? parsed.usage : {};
	return {
		text,
		toolUses,
		usage: {
			input_tokens:
				typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0,
			output_tokens:
				typeof usage.completion_tokens === "number"
					? usage.completion_tokens
					: 0,
		},
	};
}

function extractOpenAIResponsesContent(parsed: unknown): {
	text: string;
	toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
	usage: { input_tokens: number; output_tokens: number };
} {
	if (isRecord(parsed) && typeof parsed.output_text === "string") {
		return {
			text: parsed.output_text,
			toolUses: [],
			usage: { input_tokens: 0, output_tokens: 0 },
		};
	}
	const output =
		isRecord(parsed) && Array.isArray(parsed.output) ? parsed.output : [];
	let text = "";
	const toolUses: Array<{
		id: string;
		name: string;
		input: Record<string, unknown>;
	}> = [];
	for (const item of output.filter(isRecord)) {
		if (item.type === "message" && Array.isArray(item.content)) {
			text += normalizeTextContent(item.content);
		}
		if (item.type === "function_call") {
			let input: Record<string, unknown> = {};
			if (typeof item.arguments === "string") {
				try {
					input = normalizeJsonObject(JSON.parse(item.arguments) as unknown);
				} catch {}
			}
			toolUses.push({
				id: typeof item.call_id === "string" ? item.call_id : randomUUID(),
				name: typeof item.name === "string" ? item.name : "",
				input,
			});
		}
	}
	return {
		text,
		toolUses: toolUses.filter((toolUse) => toolUse.name.length > 0),
		usage: { input_tokens: 0, output_tokens: 0 },
	};
}

export function buildAnthropicResponseFromUpstream(args: {
	protocol: Exclude<ModelProviderProtocol, "anthropic">;
	requestModel: string;
	upstream: unknown;
}): JsonRecord {
	const extracted =
		args.protocol === "openai-chat"
			? extractOpenAIChatContent(args.upstream)
			: extractOpenAIResponsesContent(args.upstream);
	const content: unknown[] = [];
	if (extracted.text) content.push({ type: "text", text: extracted.text });
	for (const toolUse of extracted.toolUses) {
		content.push({
			type: "tool_use",
			id: toolUse.id,
			name: toolUse.name,
			input: toolUse.input,
		});
	}
	return {
		id:
			isRecord(args.upstream) && typeof args.upstream.id === "string"
				? args.upstream.id
				: `msg_${randomUUID()}`,
		type: "message",
		role: "assistant",
		model: args.requestModel,
		content,
		stop_reason: extracted.toolUses.length > 0 ? "tool_use" : "end_turn",
		stop_sequence: null,
		usage: extracted.usage,
	};
}

function sseEvent(event: string, data: unknown): string {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function buildAnthropicSseFromMessage(message: JsonRecord): string {
	const content = Array.isArray(message.content) ? message.content : [];
	let text = sseEvent("message_start", {
		type: "message_start",
		message: { ...message, content: [], stop_reason: null },
	});
	content.forEach((block, index) => {
		if (!isRecord(block)) return;
		if (block.type === "text") {
			text += sseEvent("content_block_start", {
				type: "content_block_start",
				index,
				content_block: { type: "text", text: "" },
			});
			text += sseEvent("content_block_delta", {
				type: "content_block_delta",
				index,
				delta: { type: "text_delta", text: block.text ?? "" },
			});
			text += sseEvent("content_block_stop", {
				type: "content_block_stop",
				index,
			});
			return;
		}
		if (block.type === "tool_use") {
			text += sseEvent("content_block_start", {
				type: "content_block_start",
				index,
				content_block: {
					type: "tool_use",
					id: block.id,
					name: block.name,
					input: {},
				},
			});
			text += sseEvent("content_block_delta", {
				type: "content_block_delta",
				index,
				delta: {
					type: "input_json_delta",
					partial_json: JSON.stringify(normalizeJsonObject(block.input)),
				},
			});
			text += sseEvent("content_block_stop", {
				type: "content_block_stop",
				index,
			});
		}
	});
	text += sseEvent("message_delta", {
		type: "message_delta",
		delta: { stop_reason: message.stop_reason, stop_sequence: null },
		usage: message.usage ?? { output_tokens: 0 },
	});
	text += sseEvent("message_stop", { type: "message_stop" });
	return text;
}
