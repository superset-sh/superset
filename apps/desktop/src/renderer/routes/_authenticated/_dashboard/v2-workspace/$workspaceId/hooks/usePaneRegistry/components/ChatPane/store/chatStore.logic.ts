/**
 * Pure reducers for the chat store.
 *
 * Every function takes the current ChatStoreData and returns the next.
 * No Zustand, no React, no side effects. These are the logic tests run
 * against — see chatStore.logic.test.ts.
 *
 * Plan reference: 20260421-v2-chat-refactor-phased-plan.md §0.2.
 */

import type {
	ApprovalRequest,
	ChatStreamEvent,
	Message,
	Part,
	PlanApprovalRequest,
	QuestionRequest,
	SessionStatus,
	TextPart,
	TodoItem,
	ToolPart,
	ToolState,
} from "@superset/chat/shared";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface FollowupItem {
	id: string;
	promptSnapshot: string;
	/** Cached attachments / context — left opaque at this layer. */
	payload: unknown;
}

export interface DockState {
	approval?: ApprovalRequest;
	question?: QuestionRequest;
	plan?: PlanApprovalRequest;
	todos: TodoItem[];
	revertMessageID?: string;
	followup: FollowupItem[];
	followupPaused: boolean;
}

export interface SessionError {
	message: string;
	kind?: "aborted" | "provider_auth" | "unknown";
	at: number;
}

export interface ChatStoreData {
	/** Messages per session, in ascending time order. */
	messages: Record<string, Message[]>;
	/** Parts per message. */
	parts: Record<string, Part[]>;
	/** Session-level status. */
	status: Record<string, SessionStatus>;
	/** Docks — approval/question/plan/todos/revert/followup per session. */
	docks: Record<string, DockState>;
	/** Whether more history is loadable via loadHistory. */
	historyMore: Record<string, boolean>;
	/** Whether a loadHistory call is in flight. */
	historyLoading: Record<string, boolean>;
	/** Latest per-session error (tool/provider/abort); surfaces in UI. */
	errors: Record<string, SessionError | undefined>;
}

export function emptyChatStoreData(): ChatStoreData {
	return {
		messages: {},
		parts: {},
		status: {},
		docks: {},
		historyMore: {},
		historyLoading: {},
		errors: {},
	};
}

function emptyDock(): DockState {
	return { todos: [], followup: [], followupPaused: false };
}

// ---------------------------------------------------------------------------
// Snapshot application
// ---------------------------------------------------------------------------

function isOptimisticId(id: string): boolean {
	return id.startsWith("opt-") || id.startsWith("optimistic-");
}

function userMessageTextSignature(parts: Part[] | undefined): string {
	if (!parts) return "";
	return parts
		.filter((p): p is Extract<Part, { type: "text" }> => p.type === "text")
		.map((p) => p.text)
		.join("");
}

export function applySessionSnapshot(
	state: ChatStoreData,
	sessionID: string,
	snapshot: {
		messages: Message[];
		parts: { [messageID: string]: Part[] };
		status: SessionStatus;
		historyMore: boolean;
	},
): ChatStoreData {
	// Preserve any optimistic user messages (opt-* / optimistic-*) whose
	// text hasn't been shadowed by a real message in the snapshot yet.
	// Without this, every tRPC poll would wipe the user's just-sent
	// message until the server's next response included it — causing a
	// visible flash-out / flash-in on every new chat.
	const existing = state.messages[sessionID] ?? [];
	const snapshotIds = new Set(snapshot.messages.map((m) => m.id));
	const realUserTexts = new Set<string>();
	for (const m of snapshot.messages) {
		if (m.role !== "user" || isOptimisticId(m.id)) continue;
		realUserTexts.add(userMessageTextSignature(snapshot.parts[m.id]));
	}

	const preservedOptimistic: Message[] = [];
	for (const m of existing) {
		if (!isOptimisticId(m.id)) continue;
		if (snapshotIds.has(m.id)) continue;
		if (m.role === "user") {
			const sig = userMessageTextSignature(state.parts[m.id]);
			if (realUserTexts.has(sig)) continue; // real has arrived — drop opt
		}
		preservedOptimistic.push(m);
	}

	const mergedMessages =
		preservedOptimistic.length === 0
			? snapshot.messages
			: insertOpts(snapshot.messages, preservedOptimistic);

	const preservedOptIds = new Set(preservedOptimistic.map((m) => m.id));

	// Keep parts for messages outside this session untouched; replace
	// parts for every messageID included in the snapshot; preserve parts
	// for optimistic messages we kept.
	const nextParts: Record<string, Part[]> = { ...state.parts };
	const owned = new Set([
		...snapshot.messages
			.filter((m) => m.sessionID === sessionID)
			.map((m) => m.id),
		...preservedOptIds,
	]);
	for (const messageID of Object.keys(nextParts)) {
		const msg = existing.find((m) => m.id === messageID);
		if (msg && !owned.has(messageID)) {
			delete nextParts[messageID];
		}
	}
	for (const [messageID, parts] of Object.entries(snapshot.parts)) {
		nextParts[messageID] = parts;
	}

	return {
		...state,
		messages: { ...state.messages, [sessionID]: mergedMessages },
		parts: nextParts,
		status: { ...state.status, [sessionID]: snapshot.status },
		historyMore: { ...state.historyMore, [sessionID]: snapshot.historyMore },
	};
}

/**
 * Merge preserved optimistic messages into the snapshot list.
 *
 * The snapshot is already ordered by the server. Optimistic messages
 * represent the user's most-recent unsent/unconfirmed work, so they
 * always belong at the tail — regardless of how their synthetic ids
 * sort lexicographically. We preserve the caller's opt ordering.
 */
function insertOpts(snapshot: Message[], opts: Message[]): Message[] {
	return [...snapshot, ...opts];
}

// ---------------------------------------------------------------------------
// Stream event application
// ---------------------------------------------------------------------------

export function applyStreamEvent(
	state: ChatStoreData,
	event: ChatStreamEvent,
): ChatStoreData {
	const sessionID = event.sessionID;
	switch (event.type) {
		case "session.snapshot":
			return applySessionSnapshot(state, sessionID, event.snapshot);

		case "session.status":
			return {
				...state,
				status: { ...state.status, [sessionID]: event.status },
			};

		case "message.append":
			return appendMessage(state, sessionID, event.message, event.optID);

		case "part.append":
			return appendPart(state, event.part);

		case "part.delta":
			return applyPartDelta(state, event);

		case "part.complete":
			return completePart(state, event.messageID, event.partID, event.at);

		case "dock.approval.set":
			return setDock(state, sessionID, (d) => ({
				...d,
				approval: event.request ?? undefined,
			}));

		case "dock.question.set":
			return setDock(state, sessionID, (d) => ({
				...d,
				question: event.request ?? undefined,
			}));

		case "dock.plan.set":
			return setDock(state, sessionID, (d) => ({
				...d,
				plan: event.request ?? undefined,
			}));

		case "dock.todos":
			return setDock(state, sessionID, (d) => ({ ...d, todos: event.todos }));

		case "dock.revert":
			return setDock(state, sessionID, (d) => ({
				...d,
				revertMessageID: event.messageID ?? undefined,
			}));

		case "error":
			return {
				...state,
				errors: {
					...state.errors,
					[sessionID]: {
						message: event.error.message,
						kind: event.error.kind,
						at: event.at,
					},
				},
			};
	}
}

function appendMessage(
	state: ChatStoreData,
	sessionID: string,
	message: Message,
	optID: string | undefined,
): ChatStoreData {
	const list = state.messages[sessionID] ?? [];

	// Optimistic swap — replace the optimistic placeholder with the
	// confirmed message but keep parts since they were client-generated
	// from the same payload.
	if (optID) {
		const idx = list.findIndex((m) => m.id === optID);
		if (idx >= 0) {
			const nextList = list.slice();
			nextList[idx] = message;

			const nextParts = { ...state.parts };
			if (optID !== message.id) {
				// Re-key parts from the optimistic ID to the confirmed ID.
				const oldParts = state.parts[optID];
				if (oldParts) {
					nextParts[message.id] = oldParts.map((p) => ({
						...p,
						messageID: message.id,
					}));
					delete nextParts[optID];
				}
			}
			return {
				...state,
				messages: { ...state.messages, [sessionID]: nextList },
				parts: nextParts,
			};
		}
	}

	// Deduplicate: if a message with this id already exists, replace in place.
	const existing = list.findIndex((m) => m.id === message.id);
	if (existing >= 0) {
		const nextList = list.slice();
		nextList[existing] = message;
		return {
			...state,
			messages: { ...state.messages, [sessionID]: nextList },
		};
	}

	// Insert in sorted order (by id — ids are ULIDs or equivalent, so
	// lexicographic order matches creation order).
	const nextList = insertSorted(list, message);
	return {
		...state,
		messages: { ...state.messages, [sessionID]: nextList },
	};
}

function appendPart(state: ChatStoreData, part: Part): ChatStoreData {
	const list = state.parts[part.messageID] ?? [];
	const existing = list.findIndex((p) => p.id === part.id);
	if (existing >= 0) {
		const next = list.slice();
		next[existing] = part;
		return { ...state, parts: { ...state.parts, [part.messageID]: next } };
	}
	return {
		...state,
		parts: { ...state.parts, [part.messageID]: [...list, part] },
	};
}

function applyPartDelta(
	state: ChatStoreData,
	event: Extract<ChatStreamEvent, { type: "part.delta" }>,
): ChatStoreData {
	const list = state.parts[event.messageID];
	if (!list) return state;
	const idx = list.findIndex((p) => p.id === event.partID);
	if (idx < 0) return state;
	const existing = list[idx];
	if (!existing) return state;

	let nextPart: Part;
	switch (event.kind) {
		case "text": {
			if (existing.type !== "text") return state;
			const textPart: TextPart = { ...existing, text: existing.text + event.delta };
			nextPart = textPart;
			break;
		}
		case "reasoning": {
			if (existing.type !== "reasoning") return state;
			nextPart = { ...existing, text: existing.text + event.delta };
			break;
		}
		case "tool.input": {
			if (existing.type !== "tool") return state;
			const merged = mergeToolInput(existing.state, event.inputDelta);
			const toolPart: ToolPart = { ...existing, state: merged };
			nextPart = toolPart;
			break;
		}
		case "tool.state": {
			if (existing.type !== "tool") return state;
			const nextState: ToolState =
				event.state.kind === "running"
					? { kind: "running", input: existing.state.input }
					: event.state.kind === "completed"
						? {
								kind: "completed",
								input: existing.state.input,
								output: event.state.output,
							}
						: {
								kind: "error",
								input: existing.state.input,
								error: event.state.error,
								output: event.state.output,
							};
			const toolPart: ToolPart = { ...existing, state: nextState };
			nextPart = toolPart;
			break;
		}
	}

	const next = list.slice();
	next[idx] = nextPart;
	return { ...state, parts: { ...state.parts, [event.messageID]: next } };
}

function mergeToolInput(prev: ToolState, inputDelta: unknown): ToolState {
	// Object-merge if both are plain objects; otherwise replace.
	if (
		isPlainObject(prev.input) &&
		isPlainObject(inputDelta) &&
		(prev.kind === "input-streaming" || prev.kind === "running")
	) {
		return { ...prev, input: { ...prev.input, ...inputDelta } };
	}
	return { ...prev, input: inputDelta };
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
	return typeof x === "object" && x !== null && !Array.isArray(x);
}

function completePart(
	state: ChatStoreData,
	messageID: string,
	partID: string,
	at: number,
): ChatStoreData {
	const list = state.parts[messageID];
	if (!list) return state;
	const idx = list.findIndex((p) => p.id === partID);
	if (idx < 0) return state;
	const existing = list[idx];
	if (!existing) return state;
	const next = list.slice();
	next[idx] = { ...existing, time: { ...existing.time, end: at } };
	return { ...state, parts: { ...state.parts, [messageID]: next } };
}

function setDock(
	state: ChatStoreData,
	sessionID: string,
	update: (prev: DockState) => DockState,
): ChatStoreData {
	const prev = state.docks[sessionID] ?? emptyDock();
	return {
		...state,
		docks: { ...state.docks, [sessionID]: update(prev) },
	};
}

function insertSorted(list: Message[], message: Message): Message[] {
	// Linear scan from the end — newly-appended messages usually go last.
	for (let i = list.length - 1; i >= 0; i--) {
		const item = list[i];
		if (item && item.id < message.id) {
			const next = list.slice();
			next.splice(i + 1, 0, message);
			return next;
		}
	}
	return [message, ...list];
}

// ---------------------------------------------------------------------------
// Optimistic lifecycle
// ---------------------------------------------------------------------------

export function addOptimistic(
	state: ChatStoreData,
	sessionID: string,
	message: Message,
	parts: Part[],
): ChatStoreData {
	return {
		...state,
		messages: {
			...state.messages,
			[sessionID]: insertSorted(state.messages[sessionID] ?? [], message),
		},
		parts: { ...state.parts, [message.id]: parts },
	};
}

export function replaceOptimistic(
	state: ChatStoreData,
	sessionID: string,
	optID: string,
	confirmed: { message: Message; parts: Part[] },
): ChatStoreData {
	const list = state.messages[sessionID] ?? [];
	const idx = list.findIndex((m) => m.id === optID);
	if (idx < 0) {
		// Optimistic already gone — fall back to append-and-upsert.
		return appendMessage(state, sessionID, confirmed.message, undefined);
	}
	const nextList = list.slice();
	nextList[idx] = confirmed.message;

	const nextParts = { ...state.parts };
	if (optID !== confirmed.message.id) delete nextParts[optID];
	nextParts[confirmed.message.id] = confirmed.parts;

	return {
		...state,
		messages: { ...state.messages, [sessionID]: nextList },
		parts: nextParts,
	};
}

export function rollbackOptimistic(
	state: ChatStoreData,
	sessionID: string,
	optID: string,
): ChatStoreData {
	const list = state.messages[sessionID];
	if (!list) return state;
	const nextList = list.filter((m) => m.id !== optID);
	if (nextList.length === list.length) return state;

	const nextParts = { ...state.parts };
	delete nextParts[optID];
	return {
		...state,
		messages: { ...state.messages, [sessionID]: nextList },
		parts: nextParts,
	};
}
