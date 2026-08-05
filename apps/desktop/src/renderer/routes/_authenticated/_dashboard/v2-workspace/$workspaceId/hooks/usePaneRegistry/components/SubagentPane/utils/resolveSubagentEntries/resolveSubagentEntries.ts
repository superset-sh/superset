import { parseSubagentToolResult } from "renderer/components/Chat/ChatInterface/components/ToolCallBlock/components/SubagentToolCall/utils/parseSubagentToolResult";
import { normalizeToolName } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
import {
	type SubagentEntries,
	toSubagentViewModels,
} from "../../../ChatPane/components/WorkspaceChatInterface/components/ChatMessageList/components/SubagentExecutionMessage/utils/toSubagentViewModels";
import type { UseChatDisplayReturn } from "../../../ChatPane/hooks/useWorkspaceChatDisplay";

type ChatMessage = NonNullable<UseChatDisplayReturn["messages"]>[number];
type ChatMessageContent = ChatMessage["content"][number];
type ChatToolCall = Extract<ChatMessageContent, { type: "tool_call" }>;
type ChatToolResult = Extract<ChatMessageContent, { type: "tool_result" }>;
type ChatActiveSubagents = NonNullable<UseChatDisplayReturn["activeSubagents"]>;

function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function findToolCallAndResult(
	messages: ChatMessage[],
	toolCallId: string,
): { call: ChatToolCall | null; result: ChatToolResult | null } {
	let call: ChatToolCall | null = null;
	let result: ChatToolResult | null = null;

	for (const message of messages) {
		for (const part of message.content) {
			if (part.type === "tool_call" && part.id === toolCallId) {
				call = part;
			}
			if (part.type === "tool_result" && part.id === toolCallId) {
				result = part;
			}
		}
	}

	return { call, result };
}

function subagentFromMessages(
	messages: ChatMessage[],
	toolCallId: string,
	fallback: { task?: string; agentType?: string },
): SubagentEntries[number] | null {
	const { call, result } = findToolCallAndResult(messages, toolCallId);
	if (!call || normalizeToolName(call.name) !== "subagent") {
		if (!fallback.task && !fallback.agentType) return null;
		return [
			toolCallId,
			{
				agentType: fallback.agentType ?? "subagent",
				task: fallback.task ?? "Working on task...",
				textDelta: "",
				toolCalls: [],
				status: "running",
			},
		];
	}

	const args = asRecord(call.args) ?? {};
	const rawResult = result?.result;
	const parsed =
		typeof rawResult === "string"
			? parseSubagentToolResult({ content: rawResult })
			: parseSubagentToolResult(rawResult);
	const status = result
		? result.isError
			? ("error" as const)
			: ("completed" as const)
		: ("running" as const);

	const resultText =
		parsed.text ||
		(typeof rawResult === "string" ? rawResult.trim() : "") ||
		undefined;

	return [
		toolCallId,
		{
			agentType: asString(args.agentType) ?? fallback.agentType ?? "subagent",
			task: asString(args.task) ?? fallback.task ?? "Working on task...",
			modelId: parsed.modelId,
			textDelta: "",
			result: status === "running" ? undefined : resultText,
			durationMs: parsed.durationMs,
			toolCalls: parsed.tools.map((tool) => ({
				name: tool.name,
				isError: tool.isError,
				args: tool.args,
				result: tool.result,
			})),
			status,
			...(result?.isError ? { error: resultText || "Failed" } : {}),
		},
	];
}

export function resolveSubagentEntries({
	toolCallId,
	activeSubagents,
	messages,
	fallback,
}: {
	toolCallId: string;
	activeSubagents: ChatActiveSubagents | undefined | null;
	messages: ChatMessage[];
	fallback: { task?: string; agentType?: string };
}): SubagentEntries {
	const live = activeSubagents?.get?.(toolCallId);
	if (live !== undefined && live !== null) {
		return [[toolCallId, live]];
	}

	const fromMessages = subagentFromMessages(messages, toolCallId, fallback);
	return fromMessages ? [fromMessages] : [];
}

export function resolveSubagentTitle({
	toolCallId,
	activeSubagents,
	messages,
	fallback,
}: {
	toolCallId: string;
	activeSubagents: ChatActiveSubagents | undefined | null;
	messages: ChatMessage[];
	fallback: { task?: string; agentType?: string };
}): string {
	const entries = resolveSubagentEntries({
		toolCallId,
		activeSubagents,
		messages,
		fallback,
	});
	const [viewModel] = toSubagentViewModels(entries);
	if (!viewModel) {
		return fallback.agentType ?? fallback.task ?? "Subagent";
	}
	return viewModel.agentType || viewModel.task || "Subagent";
}
