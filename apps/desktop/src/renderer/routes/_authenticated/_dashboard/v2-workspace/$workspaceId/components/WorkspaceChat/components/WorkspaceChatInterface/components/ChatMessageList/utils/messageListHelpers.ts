import type { ToolPart } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
import { normalizeToolName } from "renderer/components/Chat/ChatInterface/utils/tool-helpers";
import type {
	ChatActiveTool,
	ChatActiveTools,
	ChatMessage,
	ChatPendingPlanApproval,
	ChatToolInputBuffer,
	ChatToolInputBuffers,
	InterruptedMessagePreview,
} from "../ChatMessageList.types";

export function asRecord(value: unknown): Record<string, unknown> | null {
	if (typeof value === "object" && value !== null) {
		return value as Record<string, unknown>;
	}
	return null;
}

export function asString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function toPreviewToolPart({
	toolCallId,
	toolState,
	inputBuffer,
}: {
	toolCallId: string;
	toolState: ChatActiveTool | null;
	inputBuffer: ChatToolInputBuffer | null;
}): ToolPart {
	const toolStateRecord = asRecord(toolState);
	const inputBufferRecord = asRecord(inputBuffer);
	const name =
		(typeof toolStateRecord?.name === "string"
			? toolStateRecord.name
			: undefined) ??
		(typeof inputBufferRecord?.toolName === "string"
			? inputBufferRecord.toolName
			: undefined) ??
		"unknown_tool";
	const status =
		typeof toolStateRecord?.status === "string"
			? toolStateRecord.status
			: "streaming_input";
	const isError =
		typeof toolStateRecord?.isError === "boolean" && toolStateRecord.isError;
	const state: ToolPart["state"] =
		status === "error" || isError
			? "output-error"
			: status === "completed"
				? "output-available"
				: status === "streaming_input"
					? "input-streaming"
					: "input-available";
	const input = toolStateRecord?.args ?? inputBufferRecord?.text ?? {};
	const output = toolStateRecord?.result ?? toolStateRecord?.partialResult;

	return {
		type: `tool-${normalizeToolName(name)}` as ToolPart["type"],
		toolCallId,
		state,
		input,
		...(state === "output-available" || state === "output-error"
			? { output }
			: {}),
	} as ToolPart;
}

function toToolEntries<T>(
	value: Map<string, T> | undefined,
): Array<[string, T]> {
	if (!value) return [];
	return [...value.entries()];
}

function findLastUserMessageIndex(messages: ChatMessage[]): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === "user") return index;
	}
	return -1;
}

export function getVisibleMessages({
	messages,
	isRunning,
	currentMessage,
}: {
	messages: ChatMessage[];
	isRunning: boolean;
	currentMessage: ChatMessage | null;
}): ChatMessage[] {
	if (!isRunning || !currentMessage || currentMessage.role !== "assistant") {
		return messages;
	}
	const turnStartIndex = findLastUserMessageIndex(messages) + 1;
	const previousTurns = messages.slice(0, turnStartIndex);
	const activeTurnNonAssistant = messages
		.slice(turnStartIndex)
		.filter((message) => message.role !== "assistant");

	return [...previousTurns, ...activeTurnNonAssistant];
}

export function getInterruptedPreview({
	isRunning,
	interruptedMessage,
}: {
	isRunning: boolean;
	interruptedMessage: InterruptedMessagePreview | null;
}): ChatMessage | null {
	if (
		isRunning ||
		!interruptedMessage ||
		interruptedMessage.content.length === 0
	) {
		return null;
	}

	return {
		id: interruptedMessage.id,
		role: "assistant",
		content: interruptedMessage.content,
		createdAt: new Date(),
	} as ChatMessage;
}

export function removeInterruptedSourceMessage({
	messages,
	interruptedMessage,
}: {
	messages: ChatMessage[];
	interruptedMessage: InterruptedMessagePreview | null;
}): ChatMessage[] {
	if (!interruptedMessage) return messages;
	return messages.filter(
		(message) => message.id !== interruptedMessage.sourceMessageId,
	);
}

export function getStreamingPreviewToolParts({
	activeTools,
	toolInputBuffers,
}: {
	activeTools: ChatActiveTools | undefined;
	toolInputBuffers: ChatToolInputBuffers | undefined;
}): ToolPart[] {
	const activeEntries = toToolEntries(activeTools);
	const inputEntries = toToolEntries(toolInputBuffers);
	const knownIds = new Set<string>([
		...activeEntries.map(([id]) => id),
		...inputEntries.map(([id]) => id),
	]);

	return [...knownIds].map((toolCallId) => {
		const toolState =
			activeEntries.find(([id]) => id === toolCallId)?.[1] ?? null;
		const inputBuffer =
			inputEntries.find(([id]) => id === toolCallId)?.[1] ?? null;
		return toPreviewToolPart({ toolCallId, toolState, inputBuffer });
	});
}

export function findLatestSubmitPlanToolCallId({
	messages,
	previewToolParts,
}: {
	messages: ChatMessage[];
	previewToolParts: ToolPart[];
}): string | null {
	let latestToolCallId: string | null = null;
	for (const message of messages) {
		for (const part of message.content) {
			if (part.type !== "tool_call") continue;
			if (normalizeToolName(part.name) !== "submit_plan") continue;
			latestToolCallId = part.id;
		}
	}
	for (const part of previewToolParts) {
		if (part.type !== "tool-submit_plan") continue;
		latestToolCallId = part.toolCallId;
	}
	return latestToolCallId;
}

export function resolvePendingPlanToolCallId({
	pendingPlanApproval,
	fallbackToolCallId,
}: {
	pendingPlanApproval: ChatPendingPlanApproval;
	fallbackToolCallId: string | null;
}): string | null {
	if (!pendingPlanApproval) return null;
	const pendingPlanRecord = asRecord(pendingPlanApproval);
	const explicitToolCallId = asString(
		pendingPlanRecord?.toolCallId ??
			pendingPlanRecord?.tool_call_id ??
			pendingPlanRecord?.callId,
	);

	if (explicitToolCallId) {
		return explicitToolCallId;
	}

	const pendingPlanId = asString(pendingPlanRecord?.planId);
	if (pendingPlanId && pendingPlanId === fallbackToolCallId) {
		return pendingPlanId;
	}

	return fallbackToolCallId;
}
