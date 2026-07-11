import type { SessionEventEnvelope } from "../events";
import type { SessionPermissionResult } from "../permission-contract";
import type {
	ElicitationResult,
	PermissionMode,
	SDKContentBlock,
	SDKMessage,
	SDKResultMessage,
	SessionMessage,
	SlashCommand,
	UserDialogResult,
} from "../sdk-types";
import type {
	PendingElicitationRequest,
	PendingPermissionRequest,
	PendingUserDialogRequest,
	SessionScopedState,
} from "../state";
import { isRecord } from "../validation";

export type MessageRole = "user" | "assistant" | "system";

export type TimelineContentBlock =
	| SDKContentBlock
	| { type: "text"; text: string }
	| { type: "unknown"; value: unknown };

export interface MessageItem {
	kind: "message";
	id: string;
	role: MessageRole;
	blocks: TimelineContentBlock[];
	partial: boolean;
	startSeq: number;
	endSeq: number;
}

export interface PermissionView {
	request: PendingPermissionRequest;
	response: SessionPermissionResult | null;
}

export interface ToolCallItem {
	kind: "tool_call";
	id: string;
	name: string;
	input: unknown;
	result: unknown | null;
	status: "pending" | "completed" | "error" | "denied";
	permissions: PermissionView[];
	startSeq: number;
	endSeq: number;
}

export interface UserDialogItem {
	kind: "user_dialog";
	id: string;
	request: PendingUserDialogRequest;
	response: UserDialogResult | null;
	startSeq: number;
	endSeq: number;
}

export interface ElicitationItem {
	kind: "elicitation";
	id: string;
	request: PendingElicitationRequest;
	response: ElicitationResult | null;
	startSeq: number;
	endSeq: number;
}

export type TimelineItem =
	| MessageItem
	| ToolCallItem
	| UserDialogItem
	| ElicitationItem;

export interface TimelineMeta {
	claudeSessionId: string | null;
	model: string | null;
	permissionMode: PermissionMode | null;
	sdkState: "idle" | "running" | "requires_action" | null;
	commands: SlashCommand[] | null;
	lastResult: SDKResultMessage | null;
}

export interface FoldedTimeline {
	items: TimelineItem[];
	meta: TimelineMeta;
	state: SessionScopedState | null;
	lastSeq: number;
	resetReason: string | null;
}

export function emptyTimeline(): FoldedTimeline {
	return {
		items: [],
		meta: {
			claudeSessionId: null,
			model: null,
			permissionMode: null,
			sdkState: null,
			commands: null,
			lastResult: null,
		},
		state: null,
		lastSeq: 0,
		resetReason: null,
	};
}

export function foldEnvelopes(
	timeline: FoldedTimeline,
	envelopes: SessionEventEnvelope[],
): FoldedTimeline {
	let next = timeline;
	for (const envelope of envelopes) next = foldEnvelope(next, envelope);
	return next;
}

export function foldEnvelope(
	timeline: FoldedTimeline,
	envelope: SessionEventEnvelope,
): FoldedTimeline {
	const next = cloneTimeline(timeline);
	next.lastSeq = envelope.seq;

	switch (envelope.frame.kind) {
		case "sdk":
			foldSdkMessageMutable(next, envelope.frame.message, envelope.seq);
			break;
		case "permission_requested":
			foldPermissionRequested(next, envelope.frame.request, envelope.seq);
			break;
		case "permission_resolved":
			foldPermissionResolved(
				next,
				envelope.frame.requestId,
				envelope.frame.response,
				envelope.seq,
			);
			break;
		case "user_dialog_requested":
			next.items.push({
				kind: "user_dialog",
				id: envelope.frame.request.requestId,
				request: envelope.frame.request,
				response: null,
				startSeq: envelope.seq,
				endSeq: envelope.seq,
			});
			break;
		case "user_dialog_resolved":
			resolveUserDialog(
				next,
				envelope.frame.requestId,
				envelope.frame.response,
				envelope.seq,
			);
			break;
		case "elicitation_requested":
			next.items.push({
				kind: "elicitation",
				id: envelope.frame.request.requestId,
				request: envelope.frame.request,
				response: null,
				startSeq: envelope.seq,
				endSeq: envelope.seq,
			});
			break;
		case "elicitation_resolved":
			resolveElicitation(
				next,
				envelope.frame.requestId,
				envelope.frame.response,
				envelope.seq,
			);
			break;
		case "state":
			next.state = envelope.frame.state;
			break;
		case "reset":
			next.resetReason = envelope.frame.reason;
			break;
	}

	return next;
}

/** Fold a single raw SDK message without wrapping it in a journal envelope. */
export function foldSdkMessage(
	timeline: FoldedTimeline,
	message: SDKMessage,
	seq = timeline.lastSeq,
): FoldedTimeline {
	const next = cloneTimeline(timeline);
	foldSdkMessageMutable(next, message, seq);
	return next;
}

/**
 * Fold Claude transcript truth separately from the bounded live journal. The
 * transcript has no Superset seq, so history never advances `lastSeq`.
 */
export function foldSessionMessages(
	timeline: FoldedTimeline,
	messages: SessionMessage[],
): FoldedTimeline {
	const next = cloneTimeline(timeline);
	for (const message of messages) foldSessionMessageMutable(next, message);
	return next;
}

export function timelineFromSessionMessages(
	messages: SessionMessage[],
): FoldedTimeline {
	return foldSessionMessages(emptyTimeline(), messages);
}

function foldSdkMessageMutable(
	timeline: FoldedTimeline,
	message: SDKMessage,
	seq: number,
): void {
	switch (message.type) {
		case "assistant":
			foldAssistantContent(
				timeline,
				message.uuid,
				message.message.content,
				seq,
				false,
			);
			break;
		case "user":
			foldUserContent(
				timeline,
				message.uuid ?? `live:${seq}`,
				message.message.content,
				seq,
			);
			break;
		case "result":
			timeline.meta.lastResult = message;
			break;
		case "stream_event":
			foldStreamEvent(timeline, message.uuid, message.event, seq);
			break;
		case "system":
			foldSystemMessage(timeline, message, seq);
			break;
		default:
			// The SDK adds informational variants frequently. Their raw envelopes
			// remain available even when this optional view has nothing to render.
			break;
	}
}

function foldSystemMessage(
	timeline: FoldedTimeline,
	message: Extract<SDKMessage, { type: "system" }>,
	seq: number,
): void {
	switch (message.subtype) {
		case "init":
			timeline.meta.claudeSessionId = message.session_id;
			timeline.meta.model = message.model;
			timeline.meta.permissionMode = message.permissionMode;
			break;
		case "session_state_changed":
			timeline.meta.sdkState = message.state;
			break;
		case "commands_changed":
			timeline.meta.commands = message.commands;
			break;
		case "status":
			if (message.permissionMode !== undefined) {
				timeline.meta.permissionMode = message.permissionMode;
			}
			break;
		case "permission_denied": {
			const tool = findToolCall(timeline.items, message.tool_use_id);
			if (tool) {
				replaceItem(timeline.items, tool, {
					...tool,
					status: "denied",
					endSeq: seq,
				});
			}
			break;
		}
		default:
			break;
	}
}

function foldAssistantContent(
	timeline: FoldedTimeline,
	uuid: string,
	content: unknown,
	seq: number,
	partial: boolean,
): void {
	if (!Array.isArray(content)) return;
	const idPrefix = `message:assistant:${uuid}:`;
	const usedMessageIds = new Set<string>();
	let blocks: TimelineContentBlock[] = [];
	let segment = 0;
	const flushMessage = () => {
		if (blocks.length === 0) return;
		const id = `${idPrefix}${segment}`;
		segment += 1;
		usedMessageIds.add(id);
		const existing = findMessage(timeline.items, id);
		const item: MessageItem = {
			kind: "message",
			id,
			role: "assistant",
			blocks,
			partial,
			startSeq: existing?.startSeq ?? seq,
			endSeq: seq,
		};
		if (existing) replaceItem(timeline.items, existing, item);
		else timeline.items.push(item);
		blocks = [];
	};

	for (const block of content) {
		if (!isRecord(block) || typeof block.type !== "string") continue;
		if (isToolUseBlock(block)) {
			// Content order is meaningful: flush prose/reasoning before inserting
			// the tool item, then start a new message segment after it.
			flushMessage();
			upsertToolCall(timeline, block.id, block.name, block.input, seq);
			continue;
		}
		blocks.push(block as TimelineContentBlock);
	}
	flushMessage();

	if (!partial) {
		// A complete message is authoritative over provisional stream blocks.
		for (const item of [...timeline.items]) {
			if (
				item.kind === "message" &&
				item.id.startsWith(idPrefix) &&
				item.partial &&
				!usedMessageIds.has(item.id)
			) {
				removeItem(timeline.items, item);
			}
		}
	}
}

function foldUserContent(
	timeline: FoldedTimeline,
	uuid: string,
	content: unknown,
	seq: number,
): void {
	const rawBlocks =
		typeof content === "string"
			? [{ type: "text", text: content }]
			: Array.isArray(content)
				? content
				: [];
	const blocks: TimelineContentBlock[] = [];

	for (const block of rawBlocks) {
		if (!isRecord(block) || typeof block.type !== "string") continue;
		if (block.type === "tool_result" && typeof block.tool_use_id === "string") {
			foldToolResult(timeline, block.tool_use_id, block, seq);
			continue;
		}
		blocks.push(block as TimelineContentBlock);
	}

	if (blocks.length === 0) return;
	const id = `message:user:${uuid}`;
	const existing = findMessage(timeline.items, id);
	const item: MessageItem = {
		kind: "message",
		id,
		role: "user",
		blocks,
		partial: false,
		startSeq: existing?.startSeq ?? seq,
		endSeq: seq,
	};
	if (existing) replaceItem(timeline.items, existing, item);
	else timeline.items.push(item);
}

function foldStreamEvent(
	timeline: FoldedTimeline,
	uuid: string,
	event: unknown,
	seq: number,
): void {
	if (!isRecord(event) || typeof event.type !== "string") return;
	if (event.type === "content_block_start" && isRecord(event.content_block)) {
		const block = event.content_block;
		if (isToolUseBlock(block)) {
			upsertToolCall(timeline, block.id, block.name, block.input, seq);
			return;
		}
		if (block.type === "text" && typeof block.text === "string" && block.text) {
			appendPartialBlock(timeline, uuid, "text", block.text, seq);
		}
		if (
			block.type === "thinking" &&
			typeof block.thinking === "string" &&
			block.thinking
		) {
			appendPartialBlock(timeline, uuid, "thinking", block.thinking, seq);
		}
		return;
	}
	if (event.type !== "content_block_delta" || !isRecord(event.delta)) return;
	if (
		event.delta.type === "text_delta" &&
		typeof event.delta.text === "string"
	) {
		appendPartialBlock(timeline, uuid, "text", event.delta.text, seq);
	}
	if (
		event.delta.type === "thinking_delta" &&
		typeof event.delta.thinking === "string"
	) {
		appendPartialBlock(timeline, uuid, "thinking", event.delta.thinking, seq);
	}
}

function appendPartialBlock(
	timeline: FoldedTimeline,
	uuid: string,
	type: "text" | "thinking",
	value: string,
	seq: number,
): void {
	const id = `message:assistant:${uuid}:0`;
	const existing = findMessage(timeline.items, id);
	const blocks = existing ? [...existing.blocks] : [];
	const previous = blocks[blocks.length - 1];
	if (isRecord(previous) && previous.type === type) {
		const key = type === "text" ? "text" : "thinking";
		const previousRecord = previous as unknown as Record<string, unknown>;
		const priorValue =
			typeof previousRecord[key] === "string" ? previousRecord[key] : "";
		blocks[blocks.length - 1] = {
			...previous,
			[key]: priorValue + value,
		} as TimelineContentBlock;
	} else {
		blocks.push(
			type === "text"
				? { type: "text", text: value }
				: ({ type: "thinking", thinking: value } as TimelineContentBlock),
		);
	}
	const item: MessageItem = {
		kind: "message",
		id,
		role: "assistant",
		blocks,
		partial: true,
		startSeq: existing?.startSeq ?? seq,
		endSeq: seq,
	};
	if (existing) replaceItem(timeline.items, existing, item);
	else timeline.items.push(item);
}

function foldPermissionRequested(
	timeline: FoldedTimeline,
	request: PendingPermissionRequest,
	seq: number,
): void {
	let tool = findToolCall(timeline.items, request.toolUseID);
	if (!tool) {
		tool = {
			kind: "tool_call",
			id: request.toolUseID,
			name: request.toolName,
			input: request.input,
			result: null,
			status: "pending",
			permissions: [],
			startSeq: seq,
			endSeq: seq,
		};
		timeline.items.push(tool);
	}
	replaceItem(timeline.items, tool, {
		...tool,
		permissions: [...tool.permissions, { request, response: null }],
		endSeq: seq,
	});
}

function foldPermissionResolved(
	timeline: FoldedTimeline,
	requestId: string,
	response: SessionPermissionResult,
	seq: number,
): void {
	for (let index = timeline.items.length - 1; index >= 0; index -= 1) {
		const item = timeline.items[index];
		if (item?.kind !== "tool_call") continue;
		const permissionIndex = item.permissions.findIndex(
			(permission) => permission.request.requestId === requestId,
		);
		if (permissionIndex === -1) continue;
		const permissions = [...item.permissions];
		const permission = permissions[permissionIndex];
		if (!permission) return;
		permissions[permissionIndex] = { ...permission, response };
		timeline.items[index] = { ...item, permissions, endSeq: seq };
		return;
	}
}

function resolveUserDialog(
	timeline: FoldedTimeline,
	requestId: string,
	response: UserDialogResult,
	seq: number,
): void {
	for (let index = timeline.items.length - 1; index >= 0; index -= 1) {
		const item = timeline.items[index];
		if (item?.kind !== "user_dialog" || item.id !== requestId) continue;
		timeline.items[index] = { ...item, response, endSeq: seq };
		return;
	}
}

function resolveElicitation(
	timeline: FoldedTimeline,
	requestId: string,
	response: ElicitationResult,
	seq: number,
): void {
	for (let index = timeline.items.length - 1; index >= 0; index -= 1) {
		const item = timeline.items[index];
		if (item?.kind !== "elicitation" || item.id !== requestId) continue;
		timeline.items[index] = { ...item, response, endSeq: seq };
		return;
	}
}

function upsertToolCall(
	timeline: FoldedTimeline,
	id: string,
	name: string,
	input: unknown,
	seq: number,
): void {
	const existing = findToolCall(timeline.items, id);
	if (existing) {
		replaceItem(timeline.items, existing, {
			...existing,
			name,
			input,
			endSeq: seq,
		});
		return;
	}
	timeline.items.push({
		kind: "tool_call",
		id,
		name,
		input,
		result: null,
		status: "pending",
		permissions: [],
		startSeq: seq,
		endSeq: seq,
	});
}

function foldToolResult(
	timeline: FoldedTimeline,
	toolUseID: string,
	result: Record<string, unknown>,
	seq: number,
): void {
	const existing = findToolCall(timeline.items, toolUseID);
	const isError = result.is_error === true;
	if (existing) {
		replaceItem(timeline.items, existing, {
			...existing,
			result,
			status: isError ? "error" : "completed",
			endSeq: seq,
		});
		return;
	}
	timeline.items.push({
		kind: "tool_call",
		id: toolUseID,
		name: "Unknown tool",
		input: null,
		result,
		status: isError ? "error" : "completed",
		permissions: [],
		startSeq: seq,
		endSeq: seq,
	});
}

function foldSessionMessageMutable(
	timeline: FoldedTimeline,
	message: SessionMessage,
): void {
	const body = message.message;
	if (message.type === "assistant" && isRecord(body)) {
		foldAssistantContent(timeline, message.uuid, body.content, 0, false);
		return;
	}
	if (message.type === "user" && isRecord(body)) {
		foldUserContent(timeline, message.uuid, body.content, 0);
		return;
	}
	if (message.type === "system") {
		const block: TimelineContentBlock = isRecord(body)
			? ({
					...body,
					type: String(body.type ?? "unknown"),
				} as TimelineContentBlock)
			: { type: "unknown", value: body };
		timeline.items.push({
			kind: "message",
			id: `message:system:${message.uuid}`,
			role: "system",
			blocks: [block],
			partial: false,
			startSeq: 0,
			endSeq: 0,
		});
	}
}

function isToolUseBlock(block: Record<string, unknown>): block is Record<
	string,
	unknown
> & {
	id: string;
	name: string;
	input: unknown;
} {
	return (
		(block.type === "tool_use" || block.type === "server_tool_use") &&
		typeof block.id === "string" &&
		typeof block.name === "string"
	);
}

function cloneTimeline(timeline: FoldedTimeline): FoldedTimeline {
	return {
		...timeline,
		items: [...timeline.items],
		meta: { ...timeline.meta },
	};
}

function findMessage(
	items: TimelineItem[],
	id: string,
): MessageItem | undefined {
	for (let index = items.length - 1; index >= 0; index -= 1) {
		const item = items[index];
		if (item?.kind === "message" && item.id === id) return item;
	}
	return undefined;
}

function findToolCall(
	items: TimelineItem[],
	id: string,
): ToolCallItem | undefined {
	for (let index = items.length - 1; index >= 0; index -= 1) {
		const item = items[index];
		if (item?.kind === "tool_call" && item.id === id) return item;
	}
	return undefined;
}

function replaceItem<T extends TimelineItem>(
	items: TimelineItem[],
	oldItem: T,
	newItem: T,
): void {
	const index = items.indexOf(oldItem);
	if (index !== -1) items[index] = newItem;
}

function removeItem(items: TimelineItem[], item: TimelineItem): void {
	const index = items.indexOf(item);
	if (index !== -1) items.splice(index, 1);
}
