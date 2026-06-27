import type {
	ChatDisplayState,
	ChatMessage,
	ChatMessagePart,
	ChatMessagePayload,
} from "./acp-types";

export interface AcpTextContentBlock {
	type: "text";
	text: string;
}

export interface AcpResourceContentBlock {
	type: "resource";
	resource: {
		uri: string;
		mimeType: string;
		text?: string;
		blob?: string;
	};
}

export interface AcpImageContentBlock {
	type: "image";
	data: string;
	mimeType: string;
}

export type AcpContentBlock =
	| AcpTextContentBlock
	| AcpResourceContentBlock
	| AcpImageContentBlock;

export type AcpPromptBlock = AcpContentBlock;

export interface AcpSessionNotification {
	sessionId: string;
	update: AcpSessionUpdate;
}

export interface AcpSessionUpdate {
	sessionUpdate: string;
	content?: unknown;
	toolCallId?: unknown;
	title?: unknown;
	kind?: unknown;
	status?: unknown;
	rawInput?: unknown;
	rawOutput?: unknown;
	planId?: unknown;
}

export interface AcpPermissionOption {
	optionId: string;
	name: string;
	kind?: string;
}

export interface AcpPermissionRequest {
	sessionId: string;
	toolCall: {
		toolCallId?: string;
		title?: string;
		kind?: string;
		status?: string;
		rawInput?: unknown;
		content?: unknown;
		[key: string]: unknown;
	};
	options: AcpPermissionOption[];
}

export function createInitialDisplayState(): ChatDisplayState {
	return {
		isRunning: false,
		currentMessage: null,
		pendingApproval: null,
		pendingPlanApproval: null,
		pendingQuestion: null,
		activeTools: new Map(),
		toolInputBuffers: new Map(),
		activeSubagents: new Map(),
		errorMessage: null,
	};
}

export function payloadToAcpPrompt(
	payload: ChatMessagePayload,
): AcpPromptBlock[] {
	const prompt: AcpPromptBlock[] = [];
	const text = payload.content.trim();
	if (text.length > 0) {
		prompt.push({ type: "text", text });
	}

	for (const file of payload.files ?? []) {
		const filename = file.filename?.trim() || "attachment";
		if (file.mediaType.startsWith("image/")) {
			prompt.push({
				type: "image",
				data: stripDataUrlPrefix(file.data),
				mimeType: file.mediaType,
			});
			continue;
		}

		const isText =
			file.mediaType.startsWith("text/") || file.mediaType.includes("json");
		prompt.push({
			type: "resource",
			resource: {
				uri: `file://${filename}`,
				mimeType: file.mediaType,
				...(isText
					? { text: decodeBase64Text(stripDataUrlPrefix(file.data)) }
					: { blob: stripDataUrlPrefix(file.data) }),
			},
		});
	}

	if (prompt.length === 0) {
		prompt.push({ type: "text", text: "[non-text message]" });
	}
	return prompt;
}

export function payloadToChatParts(
	payload: ChatMessagePayload,
): ChatMessagePart[] {
	const parts: ChatMessagePart[] = [];
	for (const file of payload.files ?? []) {
		if (file.mediaType.startsWith("image/")) {
			parts.push({
				type: "image",
				data: stripDataUrlPrefix(file.data),
				mimeType: file.mediaType,
			});
			continue;
		}
		parts.push({
			type: "file",
			data: file.data,
			mediaType: file.mediaType,
			...(file.filename ? { filename: file.filename } : {}),
		});
	}
	const text = payload.content.trim();
	if (text.length > 0) {
		parts.push({ type: "text", text });
	}
	return parts.length > 0
		? parts
		: [{ type: "text", text: "[non-text message]" }];
}

export function appendAcpUpdateToDisplayState({
	state,
	update,
	now = new Date(),
}: {
	state: ChatDisplayState;
	update: AcpSessionUpdate;
	now?: Date;
}): void {
	if (update.sessionUpdate === "agent_message_chunk") {
		const text = acpContentToText(update.content);
		if (text.length > 0)
			appendTextPart(ensureCurrentAssistantMessage(state, now), text);
		return;
	}

	if (update.sessionUpdate === "agent_thought_chunk") {
		const text = acpContentToText(update.content);
		if (text.length > 0)
			appendThinkingPart(ensureCurrentAssistantMessage(state, now), text);
		return;
	}

	if (update.sessionUpdate === "tool_call") {
		const toolCallId = idValue(update.toolCallId) ?? crypto.randomUUID();
		const toolName =
			stringValue(update.title) ?? stringValue(update.kind) ?? "tool";
		const args = update.rawInput ?? update.content ?? {};
		const message = ensureCurrentAssistantMessage(state, now);
		message.content.push({
			type: "tool_call",
			id: toolCallId,
			name: toolName,
			args,
		});
		state.activeTools.set(toolCallId, {
			toolCallId,
			state: "input-available",
			input: args,
		});
		return;
	}

	if (update.sessionUpdate === "tool_call_update") {
		const toolCallId = idValue(update.toolCallId);
		if (!toolCallId) return;
		const status = stringValue(update.status) ?? "in_progress";
		const message = ensureCurrentAssistantMessage(state, now);
		const toolName = findToolName(message, toolCallId) ?? "tool";
		if (status === "completed" || status === "failed") {
			message.content.push({
				type: "tool_result",
				id: toolCallId,
				name: toolName,
				result: update.rawOutput ?? update.content ?? status,
				...(status === "failed" ? { isError: true } : {}),
			});
			state.activeTools.delete(toolCallId);
			state.toolInputBuffers.delete(toolCallId);
			return;
		}
		const existingTool = state.activeTools.get(toolCallId);
		state.activeTools.set(toolCallId, {
			toolCallId,
			state: "input-streaming",
			input: update.content ?? recordProperty(existingTool, "input") ?? {},
		});
		return;
	}

	if (update.sessionUpdate === "plan") {
		const text = [stringValue(update.title), acpContentToText(update.content)]
			.filter(
				(part): part is string => typeof part === "string" && part.length > 0,
			)
			.join("\n\n");
		if (text.length > 0)
			appendTextPart(ensureCurrentAssistantMessage(state, now), text);
	}
}

export function finishCurrentAssistantMessage({
	state,
	history,
	stopReason,
	errorMessage,
}: {
	state: ChatDisplayState;
	history: ChatMessage[];
	stopReason: string;
	errorMessage?: string;
}): void {
	if (state.currentMessage) {
		state.currentMessage.stopReason = stopReason;
		if (errorMessage) state.currentMessage.errorMessage = errorMessage;
		history.push(state.currentMessage);
	}
	state.currentMessage = null;
	state.isRunning = false;
	state.activeTools.clear();
	state.toolInputBuffers.clear();
	state.pendingApproval = null;
	state.pendingQuestion = null;
	state.errorMessage = errorMessage ?? null;
}

function ensureCurrentAssistantMessage(
	state: ChatDisplayState,
	now: Date,
): ChatMessage {
	state.isRunning = true;
	if (!state.currentMessage) {
		state.currentMessage = {
			id: `assistant-${crypto.randomUUID()}`,
			role: "assistant",
			content: [],
			createdAt: now,
		};
	}
	return state.currentMessage;
}

function appendTextPart(message: ChatMessage, text: string): void {
	const last = message.content.at(-1);
	if (last?.type === "text") {
		last.text += text;
		return;
	}
	message.content.push({ type: "text", text });
}

function appendThinkingPart(message: ChatMessage, thinking: string): void {
	const last = message.content.at(-1);
	if (last?.type === "thinking") {
		last.thinking += thinking;
		return;
	}
	message.content.push({ type: "thinking", thinking });
}

function findToolName(message: ChatMessage, toolCallId: string): string | null {
	for (const part of message.content) {
		if (part.type === "tool_call" && part.id === toolCallId) return part.name;
	}
	return null;
}

function acpContentToText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!isRecord(content)) return "";
	if (content.type === "text" && typeof content.text === "string") {
		return content.text;
	}
	if (content.type !== "resource" || !isRecord(content.resource)) return "";
	return typeof content.resource.text === "string" ? content.resource.text : "";
}

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function idValue(value: unknown): string | null {
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return stringValue(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function recordProperty(value: unknown, key: string): unknown {
	if (!isRecord(value) || !(key in value)) return null;
	return value[key];
}

function stripDataUrlPrefix(data: string): string {
	const marker = ";base64,";
	const index = data.indexOf(marker);
	return index === -1 ? data : data.slice(index + marker.length);
}

function decodeBase64Text(data: string): string {
	try {
		return Buffer.from(data, "base64").toString("utf-8");
	} catch {
		return data;
	}
}
