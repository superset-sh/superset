import type {
	ContentBlock,
	PermissionOption,
	PermissionOutcome,
	PlanEntry,
	SessionSettings,
	ToolCall,
} from "../protocol/entities";
import type { SessionEvent } from "../protocol/events";
import type { JsonValue } from "../protocol/primitives";

// ---------------------------------------------------------------------------
// Timeline model: canonical SessionEvents folded into renderable items. The
// successor of session-protocol's envelope fold, rebuilt over the sessions
// sync protocol (plans/host-sessions-sync.md). Pure and framework-free: the
// React bindings memoize over it, the fold itself never touches a store.
// ---------------------------------------------------------------------------

export type TimelineMessageRole = "user" | "agent" | "thought";

export interface TimelineMessageItem {
	kind: "message";
	/** Stable render key: `${messageId}:${role}:${ordinal}`. */
	id: string;
	role: TimelineMessageRole;
	blocks: ContentBlock[];
	/** True when the turn carrying this user message failed. */
	failed: boolean;
}

export interface TimelinePermissionView {
	permissionId: string;
	options: PermissionOption[];
	requestedAt: number;
	/** Collect picks and answer on Done instead of resolving on first tap. */
	multiSelect: boolean;
	/** null while unresolved. */
	resolution: PermissionOutcome | null;
}

/** Canonical ToolCall plus the output accumulated from toolCallUpdated. */
export interface TimelineToolCall extends ToolCall {
	output: JsonValue | null;
}

export interface TimelineToolCallItem {
	kind: "tool_call";
	/** The canonical toolCallId. */
	id: string;
	call: TimelineToolCall;
	permissions: TimelinePermissionView[];
	/**
	 * Nested activity: child tool calls (`parentToolCallId`) and the timelines
	 * of subagent threads spawned by this call (`thread.origin.
	 * spawnedByToolCallId`) render inside their parent's card.
	 */
	children: TimelineItem[];
}

export interface TimelinePlanItem {
	kind: "plan";
	id: string;
	entries: PlanEntry[];
	removed: boolean;
}

export type TimelineItem =
	| TimelineMessageItem
	| TimelineToolCallItem
	| TimelinePlanItem;

/** A blocking ask, denormalized for permission cards above the composer. */
export interface TimelinePendingPermission {
	permissionId: string;
	sessionId: string;
	toolCallId: string;
	/** Title/input snapshot of the tool call at request time (may update). */
	toolCall: { title: string; input: JsonValue };
	options: PermissionOption[];
	multiSelect: boolean;
	requestedAt: number;
}

export interface Timeline {
	items: TimelineItem[];
	/** Unresolved permission asks, oldest first. */
	pendingPermissions: TimelinePendingPermission[];
	/** Latest settingsUpdated payload, if any event carried one. */
	settings: SessionSettings | null;
	/** Error code of the last `error`/`turnFailed` event (banner copy). */
	lastError: string | null;
	/** The running turn's id (cancelTurn target), null between turns. */
	activeTurnId: string | null;
	/** Number of events folded so far — the incremental-fold cursor. */
	eventCount: number;
}

export function emptyTimeline(): Timeline {
	return {
		items: [],
		pendingPermissions: [],
		settings: null,
		lastError: null,
		activeTurnId: null,
		eventCount: 0,
	};
}

/**
 * Fold `events[timeline.eventCount..]` into a new Timeline. Pure with
 * copy-on-write along touched paths, so React consumers see reference
 * changes exactly when content changes. Events must be the session's full
 * ordered list (the sync client store's job); to re-fold after a prepend or
 * reset, start from `emptyTimeline()`.
 */
export function foldTimeline(
	timeline: Timeline,
	events: readonly SessionEvent[],
): Timeline {
	if (events.length <= timeline.eventCount) {
		return timeline;
	}
	const next: FoldState = {
		items: [...timeline.items],
		pendingPermissions: [...timeline.pendingPermissions],
		settings: timeline.settings,
		lastError: timeline.lastError,
		activeTurnId: timeline.activeTurnId,
		eventCount: timeline.eventCount,
		messageRoles: new Map(),
		threadParents: new Map(),
		turnUserItems: new Map(),
	};
	rebuildFoldIndexes(next, events);
	for (let i = timeline.eventCount; i < events.length; i++) {
		const event = events[i];
		if (event !== undefined) {
			foldEvent(next, event);
		}
		next.eventCount = i + 1;
	}
	return {
		items: next.items,
		pendingPermissions: next.pendingPermissions,
		settings: next.settings,
		lastError: next.lastError,
		activeTurnId: next.activeTurnId,
		eventCount: next.eventCount,
	};
}

// ---------------------------------------------------------------------------
// Outcome helpers shared by permission UIs.
// ---------------------------------------------------------------------------

export function makeSelectedOutcome(
	optionIds: readonly string[],
): PermissionOutcome {
	if (optionIds.length === 0) {
		throw new Error("makeSelectedOutcome requires at least one optionId");
	}
	return { type: "selected", optionIds: [...optionIds] };
}

/** Every option id a `selected` outcome carries; [] for cancelled. */
export function selectedOptionIds(outcome: PermissionOutcome): string[] {
	return outcome.type === "selected" ? [...outcome.optionIds] : [];
}

// ---------------------------------------------------------------------------
// Internals.
// ---------------------------------------------------------------------------

interface FoldState extends Timeline {
	/** messageId → canonical role, for routing deltas. */
	messageRoles: Map<string, "user" | "assistant" | "system">;
	/** threadId → toolCallId whose card hosts that thread's items. */
	threadParents: Map<string, string>;
	/** turnId → render id of the newest user message item of that turn. */
	turnUserItems: Map<string, string>;
}

/**
 * The message-role and thread-parent indexes are derivable facts, not
 * carried on the public Timeline (it stays a plain renderable value).
 * Incremental folds rebuild them by rescanning the already-folded prefix —
 * a cheap field read per event. `turnUserItems` is deliberately NOT rebuilt:
 * turn-failure marking for turns whose user message folded in an earlier
 * pass takes the newest-user-message fallback, same as the old fold.
 */
function rebuildFoldIndexes(
	state: FoldState,
	events: readonly SessionEvent[],
): void {
	const end = Math.min(state.eventCount, events.length);
	for (let i = 0; i < end; i++) {
		const payload = events[i]?.payload;
		if (payload === undefined) continue;
		if (payload.type === "messageStarted") {
			state.messageRoles.set(payload.message.id, payload.message.role);
		} else if (
			(payload.type === "threadCreated" || payload.type === "threadUpdated") &&
			payload.thread.origin.type === "subagent"
		) {
			state.threadParents.set(
				payload.thread.id,
				payload.thread.origin.spawnedByToolCallId,
			);
		}
	}
}

function foldEvent(state: FoldState, event: SessionEvent): void {
	const payload = event.payload;
	switch (payload.type) {
		case "threadCreated":
		case "threadUpdated": {
			if (payload.thread.origin.type === "subagent") {
				state.threadParents.set(
					payload.thread.id,
					payload.thread.origin.spawnedByToolCallId,
				);
			}
			break;
		}
		case "turnStarted": {
			// Only the main thread's turn is cancellable from the composer;
			// subagent turns come and go underneath it.
			if (!state.threadParents.has(event.threadId)) {
				state.activeTurnId = payload.turn.id;
			}
			break;
		}
		case "turnFailed": {
			markTurnFailed(state, payload.turnId);
			state.lastError = payload.error.code;
			if (state.activeTurnId === payload.turnId) state.activeTurnId = null;
			break;
		}
		case "turnCompleted":
		case "turnCancelled": {
			if (state.activeTurnId === payload.turnId) state.activeTurnId = null;
			break;
		}
		case "messageStarted": {
			state.messageRoles.set(payload.message.id, payload.message.role);
			for (const block of payload.message.content) {
				appendMessageBlock(state, event, payload.message.id, block);
			}
			if (payload.message.role === "user") {
				const lastItem = state.items[state.items.length - 1];
				if (lastItem?.kind === "message" && lastItem.role === "user") {
					state.turnUserItems.set(payload.message.turnId, lastItem.id);
				}
			}
			break;
		}
		case "messageDelta": {
			appendMessageBlock(state, event, payload.messageId, payload.content);
			break;
		}
		case "messageCompleted":
			break;
		case "toolCallStarted": {
			upsertToolCall(state, event, payload.toolCall.id, (existing) =>
				existing
					? {
							...existing,
							call: { ...payload.toolCall, output: existing.call.output },
						}
					: {
							kind: "tool_call",
							id: payload.toolCall.id,
							call: { ...payload.toolCall, output: null },
							permissions: [],
							children: [],
						},
			);
			break;
		}
		case "toolCallUpdated": {
			upsertToolCall(state, event, payload.toolCallId, (existing) => {
				const base: TimelineToolCallItem = existing ?? {
					kind: "tool_call",
					id: payload.toolCallId,
					call: placeholderToolCall(event, payload.toolCallId),
					permissions: [],
					children: [],
				};
				const update = payload.update;
				return {
					...base,
					call: {
						...base.call,
						...(update.title !== undefined ? { title: update.title } : {}),
						...(update.input !== undefined ? { input: update.input } : {}),
						...(update.state !== undefined ? { state: update.state } : {}),
						...(update.output !== undefined ? { output: update.output } : {}),
						updatedAt: update.updatedAt,
					},
				};
			});
			break;
		}
		case "permissionRequested": {
			const permission = payload.permission;
			const view: TimelinePermissionView = {
				permissionId: permission.id,
				options: permission.options,
				requestedAt: permission.requestedAt,
				multiSelect: permission.multiSelect,
				resolution: null,
			};
			upsertToolCall(state, event, permission.toolCallId, (existing) => {
				const base: TimelineToolCallItem = existing ?? {
					kind: "tool_call",
					id: permission.toolCallId,
					call: placeholderToolCall(event, permission.toolCallId),
					permissions: [],
					children: [],
				};
				return { ...base, permissions: [...base.permissions, view] };
			});
			const host = findToolCall(state.items, permission.toolCallId);
			state.pendingPermissions.push({
				permissionId: permission.id,
				sessionId: permission.sessionId,
				toolCallId: permission.toolCallId,
				toolCall: {
					title: host?.call.title ?? "",
					input: host?.call.input ?? null,
				},
				options: permission.options,
				multiSelect: permission.multiSelect,
				requestedAt: permission.requestedAt,
			});
			break;
		}
		case "permissionResolved": {
			resolvePermissionView(state.items, payload.permissionId, payload.outcome);
			state.pendingPermissions = state.pendingPermissions.filter(
				(pending) => pending.permissionId !== payload.permissionId,
			);
			break;
		}
		case "planUpdated": {
			const container = containerFor(state, event.threadId);
			const existing = findOpenPlan(container);
			if (existing) {
				replaceItem(container, existing, {
					...existing,
					entries: payload.plan,
					removed: payload.plan.length === 0,
				});
			} else if (payload.plan.length > 0) {
				container.push({
					kind: "plan",
					id: `plan:${event.id}`,
					entries: payload.plan,
					removed: false,
				});
			}
			break;
		}
		case "settingsUpdated": {
			state.settings = payload.settings;
			break;
		}
		case "error": {
			state.lastError = payload.error.code;
			break;
		}
		default: {
			payload satisfies never;
			break;
		}
	}
}

/**
 * Resolve the item array an event's thread renders into: the root list for
 * the main thread, or the spawning tool call's children for a subagent
 * thread. Copy-on-write happens in the callers via patchToolCall.
 */
function containerFor(state: FoldState, threadId: string): TimelineItem[] {
	const parentToolCallId = state.threadParents.get(threadId);
	if (parentToolCallId === undefined) return state.items;
	const parent = findToolCall(state.items, parentToolCallId);
	if (!parent) return state.items;
	// Mutating children in place would leak into the previous fold; swap the
	// parent for a copy first and return the fresh array.
	let fresh: TimelineItem[] = state.items;
	patchToolCall(state.items, parentToolCallId, (item) => {
		const children = [...item.children];
		fresh = children;
		return { ...item, children };
	});
	return fresh;
}

function appendMessageBlock(
	state: FoldState,
	event: SessionEvent,
	messageId: string,
	block: ContentBlock,
): void {
	const canonicalRole = state.messageRoles.get(messageId) ?? "assistant";
	const role: TimelineMessageRole =
		canonicalRole === "user"
			? "user"
			: block.type === "thought"
				? "thought"
				: "agent";
	// Thought blocks render as text inside the Reasoning collapsible.
	const renderBlock: ContentBlock =
		block.type === "thought" ? { type: "text", text: block.text } : block;
	const container = containerFor(state, event.threadId);
	const last = container[container.length - 1];
	if (
		last?.kind === "message" &&
		last.role === role &&
		last.id.startsWith(`${messageId}:`)
	) {
		const blocks = [...last.blocks];
		const previous = blocks[blocks.length - 1];
		if (previous?.type === "text" && renderBlock.type === "text") {
			// Streaming fragments of one message concatenate; whole user blocks
			// get a paragraph break (the host journals prompts as full blocks).
			const separator = role === "user" ? "\n\n" : "";
			blocks[blocks.length - 1] = {
				...previous,
				text: previous.text + separator + renderBlock.text,
			};
		} else {
			blocks.push(renderBlock);
		}
		container[container.length - 1] = { ...last, blocks };
		return;
	}
	container.push({
		kind: "message",
		id: `${messageId}:${role}:${state.eventCount}`,
		role,
		blocks: [renderBlock],
		failed: false,
	});
}

function markTurnFailed(state: FoldState, turnId: string): void {
	const itemId = state.turnUserItems.get(turnId);
	const markById = (items: TimelineItem[], id: string): boolean => {
		for (let i = items.length - 1; i >= 0; i--) {
			const item = items[i];
			if (item?.kind === "message" && item.id === id) {
				items[i] = { ...item, failed: true };
				return true;
			}
		}
		return false;
	};
	if (itemId !== undefined && markById(state.items, itemId)) return;
	// Fallback: the rejection always follows the journaled prompt closely.
	for (let i = state.items.length - 1; i >= 0; i--) {
		const item = state.items[i];
		if (item?.kind === "message" && item.role === "user") {
			state.items[i] = { ...item, failed: true };
			return;
		}
	}
}

function placeholderToolCall(
	event: SessionEvent,
	toolCallId: string,
): TimelineToolCall {
	// A permission/update for a call we never saw (history page cut mid-turn):
	// synthesize enough of a record that the item stays renderable.
	return {
		id: toolCallId,
		sessionId: event.sessionId,
		threadId: event.threadId,
		turnId: "",
		parentToolCallId: null,
		tool: { name: "unknown", version: 1 },
		title: "",
		input: null,
		resolver: { type: "host" },
		state: "requested",
		createdAt: event.occurredAt,
		updatedAt: event.occurredAt,
		expiresAt: null,
		output: null,
	};
}

function upsertToolCall(
	state: FoldState,
	event: SessionEvent,
	toolCallId: string,
	build: (existing: TimelineToolCallItem | null) => TimelineToolCallItem,
): void {
	if (patchToolCall(state.items, toolCallId, (item) => build(item))) {
		return;
	}
	const item = build(null);
	const parentId =
		item.call.parentToolCallId ?? state.threadParents.get(event.threadId);
	if (
		parentId !== undefined &&
		parentId !== null &&
		patchToolCall(state.items, parentId, (parent) => ({
			...parent,
			children: [...parent.children, item],
		}))
	) {
		return;
	}
	containerFor(state, event.threadId).push(item);
}

/**
 * Find a tool call anywhere in the tree (newest-first at every level) and
 * swap it via `patch`, rewriting ancestors copy-on-write.
 */
function patchToolCall(
	items: TimelineItem[],
	toolCallId: string,
	patch: (item: TimelineToolCallItem) => TimelineToolCallItem,
): boolean {
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		if (item?.kind !== "tool_call") continue;
		if (item.id === toolCallId) {
			items[i] = patch(item);
			return true;
		}
		if (item.children.length === 0) continue;
		const children = [...item.children];
		if (patchToolCall(children, toolCallId, patch)) {
			items[i] = { ...item, children };
			return true;
		}
	}
	return false;
}

function findToolCall(
	items: readonly TimelineItem[],
	toolCallId: string,
): TimelineToolCallItem | null {
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		if (item?.kind !== "tool_call") continue;
		if (item.id === toolCallId) return item;
		const nested = findToolCall(item.children, toolCallId);
		if (nested) return nested;
	}
	return null;
}

function resolvePermissionView(
	items: TimelineItem[],
	permissionId: string,
	outcome: PermissionOutcome,
): boolean {
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		if (item?.kind !== "tool_call") continue;
		const index = item.permissions.findIndex(
			(view) => view.permissionId === permissionId,
		);
		if (index !== -1) {
			const target = item.permissions[index];
			if (!target) return false;
			const permissions = [...item.permissions];
			permissions[index] = { ...target, resolution: outcome };
			items[i] = { ...item, permissions };
			return true;
		}
		if (item.children.length === 0) continue;
		const children = [...item.children];
		if (resolvePermissionView(children, permissionId, outcome)) {
			items[i] = { ...item, children };
			return true;
		}
	}
	return false;
}

function findOpenPlan(items: TimelineItem[]): TimelinePlanItem | undefined {
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		if (item?.kind === "plan" && !item.removed) return item;
	}
	return undefined;
}

function replaceItem(
	items: TimelineItem[],
	previous: TimelineItem,
	next: TimelineItem,
): void {
	const index = items.indexOf(previous);
	if (index !== -1) items[index] = next;
}
