import type {
	AvailableCommand,
	ContentBlock,
	PermissionOption,
	PlanEntry,
	RequestPermissionOutcome,
	SessionConfigOption,
	SessionModeState,
	SessionUpdate,
	ToolCall,
	UsageUpdate,
} from "../acp";
import type { SessionUpdateEnvelope } from "../envelope";
import type { SessionScopedState } from "../state";

// ---------------------------------------------------------------------------
// Timeline model: SessionUpdateEnvelope[] folded into renderable items.
// Modeled on use-acp's groupNotifications/mergeToolCalls helpers, adapted to
// our envelope (permission frames interleave with ACP updates).
// ---------------------------------------------------------------------------

export type MessageRole = "user" | "agent" | "thought";

export interface MessageItem {
	kind: "message";
	/** Stable render key: `${role}:${startSeq}`. */
	id: string;
	role: MessageRole;
	blocks: ContentBlock[];
	/** True when the prompt carrying this message was rejected by the agent. */
	failed: boolean;
	startSeq: number;
	endSeq: number;
}

export interface PermissionView {
	requestId: string;
	options: PermissionOption[];
	requestedAt: number;
	/** Mirrors PendingPermission.multiSelect: collect picks, answer on Done. */
	multiSelect?: boolean;
	/** null while a client answer is still pending. */
	resolution: RequestPermissionOutcome | null;
}

export interface ToolCallItem {
	kind: "tool_call";
	/** The ACP toolCallId. */
	id: string;
	call: ToolCall;
	permissions: PermissionView[];
	/**
	 * Subagent timeline nested under its Task tool call. An item lands here
	 * when a frame tags it with `_meta.claudeCode.parentToolUseId`; follow-up
	 * frames often arrive untagged (tool_progress, hook-driven updates), so
	 * all tool lookups walk the whole tree by toolCallId rather than trusting
	 * per-frame tags.
	 */
	children: TimelineItem[];
	startSeq: number;
	endSeq: number;
}

export interface PlanItem {
	kind: "plan";
	id: string;
	entries: PlanEntry[];
	removed: boolean;
	startSeq: number;
	endSeq: number;
}

export type TimelineItem = MessageItem | ToolCallItem | PlanItem;

/** Session-level facts carried by meta update variants. */
export interface TimelineMeta {
	title: string | null;
	/** Context-window usage from usage_update ({used, size, cost?}). */
	usage: UsageUpdate | null;
	currentMode: SessionModeState | null;
	configOptions: SessionConfigOption[] | null;
	availableCommands: AvailableCommand[] | null;
}

export interface FoldedTimeline {
	items: TimelineItem[];
	meta: TimelineMeta;
	/** Latest state-frame snapshot seen, if any. */
	state: SessionScopedState | null;
	/** Seq of the last folded envelope (0 = nothing folded). */
	lastSeq: number;
	/** Set when a reset frame is folded — the caller must resync. */
	resetReason: string | null;
}

export function emptyTimeline(): FoldedTimeline {
	return {
		items: [],
		meta: {
			title: null,
			usage: null,
			currentMode: null,
			configOptions: null,
			availableCommands: null,
		},
		state: null,
		lastSeq: 0,
		resetReason: null,
	};
}

// ---------------------------------------------------------------------------
// Folding. Pure: every call returns a new FoldedTimeline (fresh items array),
// so React consumers get reference changes exactly when content changes.
// Envelopes are assumed in seq order — ordering/dedup is the stream client's
// job, not the fold's.
// ---------------------------------------------------------------------------

export function foldEnvelopes(
	timeline: FoldedTimeline,
	envelopes: SessionUpdateEnvelope[],
): FoldedTimeline {
	let next = timeline;
	for (const envelope of envelopes) {
		next = foldEnvelope(next, envelope);
	}
	return next;
}

export function foldEnvelope(
	timeline: FoldedTimeline,
	envelope: SessionUpdateEnvelope,
): FoldedTimeline {
	const next: FoldedTimeline = {
		...timeline,
		items: [...timeline.items],
		meta: { ...timeline.meta },
		lastSeq: envelope.seq,
	};
	const { frame } = envelope;
	switch (frame.kind) {
		case "update":
			foldUpdate(next, frame.update, envelope.seq);
			break;
		case "permission_requested": {
			const { pending } = frame;
			const view: PermissionView = {
				requestId: pending.requestId,
				options: pending.options,
				requestedAt: pending.requestedAt,
				multiSelect: pending.multiSelect,
				resolution: null,
			};
			const attached = patchToolCall(
				next.items,
				pending.toolCall.toolCallId,
				envelope.seq,
				(item) => ({
					...item,
					call: mergeToolCall(item.call, pending.toolCall),
					permissions: [...item.permissions, view],
					endSeq: envelope.seq,
				}),
			);
			if (!attached) {
				// Permission for a tool call we never saw (e.g. history page cut
				// mid-turn): synthesize an item so the request stays answerable.
				insertToolCall(
					next.items,
					{
						kind: "tool_call",
						id: pending.toolCall.toolCallId,
						call: mergeToolCall(
							{ toolCallId: pending.toolCall.toolCallId, title: "" },
							pending.toolCall,
						),
						permissions: [view],
						children: [],
						startSeq: envelope.seq,
						endSeq: envelope.seq,
					},
					claudeParentToolUseId(pending.toolCall),
					envelope.seq,
				);
			}
			break;
		}
		case "permission_resolved":
			resolvePermission(
				next.items,
				frame.requestId,
				frame.outcome,
				envelope.seq,
			);
			break;
		case "prompt_rejected":
			markPromptFailed(next.items, frame.promptStartSeq, envelope.seq);
			break;
		case "state":
			next.state = frame.state;
			break;
		case "reset":
			next.resetReason = frame.reason;
			break;
	}
	return next;
}

function foldUpdate(
	timeline: FoldedTimeline,
	update: SessionUpdate,
	seq: number,
): void {
	switch (update.sessionUpdate) {
		case "user_message_chunk":
			appendChunk(timeline, "user", update.content, seq);
			break;
		case "agent_message_chunk":
			appendChunk(timeline, "agent", update.content, seq);
			break;
		case "agent_thought_chunk":
			appendChunk(timeline, "thought", update.content, seq);
			break;
		case "tool_call":
			upsertToolCall(timeline, update, seq, () => ({ ...update }));
			break;
		case "tool_call_update":
			upsertToolCall(timeline, update, seq, () =>
				mergeToolCall({ toolCallId: update.toolCallId, title: "" }, update),
			);
			break;
		case "plan": {
			const existing = findOpenPlan(timeline.items);
			if (existing) {
				replaceItem(timeline.items, existing, {
					...existing,
					entries: update.entries,
					endSeq: seq,
				});
			} else {
				timeline.items.push({
					kind: "plan",
					id: `plan:${seq}`,
					entries: update.entries,
					removed: false,
					startSeq: seq,
					endSeq: seq,
				});
			}
			break;
		}
		case "plan_update": {
			const existing = findOpenPlan(timeline.items);
			const entries = extractPlanEntries(update.plan);
			if (existing) {
				replaceItem(timeline.items, existing, {
					...existing,
					entries: entries ?? existing.entries,
					endSeq: seq,
				});
			} else if (entries) {
				timeline.items.push({
					kind: "plan",
					id: `plan:${seq}`,
					entries,
					removed: false,
					startSeq: seq,
					endSeq: seq,
				});
			}
			break;
		}
		case "plan_removed": {
			const existing = findOpenPlan(timeline.items);
			if (existing) {
				replaceItem(timeline.items, existing, {
					...existing,
					removed: true,
					endSeq: seq,
				});
			}
			break;
		}
		case "session_info_update":
			// Per ACP: absent = unchanged, explicit null = clear.
			if (update.title !== undefined) {
				timeline.meta.title = update.title;
			}
			break;
		case "usage_update":
			timeline.meta.usage = update;
			break;
		case "current_mode_update":
			timeline.meta.currentMode = {
				currentModeId: update.currentModeId,
				availableModes: timeline.meta.currentMode?.availableModes ?? [],
			};
			break;
		case "config_option_update":
			timeline.meta.configOptions = update.configOptions;
			break;
		case "available_commands_update":
			timeline.meta.availableCommands = update.availableCommands;
			break;
		default:
			// Unknown/future variant: envelope carried it verbatim; nothing to
			// render, but folding must never throw (Decision D14-e).
			break;
	}
}

function appendChunk(
	timeline: FoldedTimeline,
	role: MessageRole,
	content: ContentBlock,
	seq: number,
): void {
	const last = timeline.items[timeline.items.length - 1];
	// User chunks merge only when seq-contiguous with the open bubble: the host
	// journals one prompt's blocks in a single synchronous run (gapless seqs)
	// and always lands a state frame between turns, so a seq gap = a new
	// prompt. Merging across that boundary would weld a retry onto a failed
	// bubble and let markPromptFailed repaint delivered prompts as failed.
	if (
		last?.kind === "message" &&
		last.role === role &&
		(role !== "user" || seq === last.endSeq + 1)
	) {
		const blocks = [...last.blocks];
		const previous = blocks[blocks.length - 1];
		if (previous?.type === "text" && content.type === "text") {
			// Agent/thought chunks are streaming fragments of one message — plain
			// concatenation. User chunks are whole blocks of one prompt (the
			// adapter doesn't echo prompts; the host journals them itself), so
			// text blocks meeting here get a paragraph break between them.
			const separator = role === "user" ? "\n\n" : "";
			blocks[blocks.length - 1] = {
				...previous,
				text: previous.text + separator + content.text,
			};
		} else {
			blocks.push(content);
		}
		timeline.items[timeline.items.length - 1] = {
			...last,
			blocks,
			endSeq: seq,
		};
		return;
	}
	timeline.items.push({
		kind: "message",
		id: `${role}:${seq}`,
		role,
		blocks: [content],
		failed: false,
		startSeq: seq,
		endSeq: seq,
	});
}

/**
 * Flag the user message whose seq range covers the rejected prompt's first
 * journaled chunk. Falls back to the newest user message — the rejection
 * always follows the journaled prompt closely.
 */
function markPromptFailed(
	items: TimelineItem[],
	promptStartSeq: number,
	seq: number,
): void {
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		if (item?.kind !== "message" || item.role !== "user") continue;
		if (item.startSeq <= promptStartSeq && promptStartSeq <= item.endSeq) {
			items[i] = { ...item, failed: true, endSeq: seq };
			return;
		}
	}
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		if (item?.kind === "message" && item.role === "user") {
			items[i] = { ...item, failed: true, endSeq: seq };
			return;
		}
	}
}

/** Fields a tool_call / tool_call_update / pending-permission frame can patch. */
interface ToolCallPatch {
	toolCallId: string;
	title?: string | null;
	kind?: ToolCall["kind"] | null;
	status?: ToolCall["status"] | null;
	content?: ToolCall["content"] | null;
	locations?: ToolCall["locations"] | null;
	rawInput?: unknown;
	rawOutput?: unknown;
	_meta?: ToolCall["_meta"];
}

/**
 * tool_call_update semantics per ACP: fields present (non-null) replace the
 * previous value; absent/null fields keep it.
 */
function mergeToolCall(base: ToolCall, patch: ToolCallPatch): ToolCall {
	return {
		...base,
		toolCallId: base.toolCallId,
		title: patch.title ?? base.title,
		kind: patch.kind ?? base.kind,
		status: patch.status ?? base.status,
		content: patch.content ?? base.content,
		locations: patch.locations ?? base.locations,
		rawInput: patch.rawInput ?? base.rawInput,
		rawOutput: patch.rawOutput ?? base.rawOutput,
		_meta: patch._meta ?? base._meta,
	};
}

/**
 * The claude-agent adapter tags subagent activity with the spawning Task
 * tool's id via `_meta.claudeCode.parentToolUseId`. Not every frame carries
 * the tag (tool_progress and hook-driven updates arrive bare), so it decides
 * only where an item is FIRST placed; later frames route by toolCallId.
 */
function claudeParentToolUseId(source: { _meta?: unknown }): string | null {
	const meta = source._meta;
	if (typeof meta !== "object" || meta === null) return null;
	const claudeCode = (meta as { claudeCode?: unknown }).claudeCode;
	if (typeof claudeCode !== "object" || claudeCode === null) return null;
	const parent = (claudeCode as { parentToolUseId?: unknown }).parentToolUseId;
	return typeof parent === "string" && parent.length > 0 ? parent : null;
}

/**
 * Merge a tool frame into the tree. A tagged frame can arrive after untagged
 * ones already parked the item at top level (permission-synthesized
 * placeholder, tool_progress) — when its Task parent exists, the item is
 * re-homed under it so the run can't render twice.
 */
function upsertToolCall(
	timeline: FoldedTimeline,
	patch: ToolCallPatch,
	seq: number,
	createCall: () => ToolCall,
): void {
	const parentId = claudeParentToolUseId(patch);
	if (parentId && hasToolCall(timeline.items, parentId)) {
		const strayIndex = timeline.items.findIndex(
			(entry) => entry.kind === "tool_call" && entry.id === patch.toolCallId,
		);
		const stray = strayIndex === -1 ? undefined : timeline.items[strayIndex];
		if (stray?.kind === "tool_call") {
			timeline.items.splice(strayIndex, 1);
			insertToolCall(
				timeline.items,
				{ ...stray, call: mergeToolCall(stray.call, patch), endSeq: seq },
				parentId,
				seq,
			);
			return;
		}
	}
	const patched = patchToolCall(
		timeline.items,
		patch.toolCallId,
		seq,
		(item) => ({
			...item,
			call: mergeToolCall(item.call, patch),
			endSeq: seq,
		}),
	);
	if (patched) return;
	insertToolCall(
		timeline.items,
		{
			kind: "tool_call",
			id: patch.toolCallId,
			call: createCall(),
			permissions: [],
			children: [],
			startSeq: seq,
			endSeq: seq,
		},
		parentId,
		seq,
	);
}

/**
 * Find a tool call anywhere in the tree (newest-first at every level) and
 * swap it via `patch`, rewriting ancestors copy-on-write so React consumers
 * see reference changes exactly along the touched path.
 */
function patchToolCall(
	items: TimelineItem[],
	toolCallId: string,
	seq: number,
	patch: (item: ToolCallItem) => ToolCallItem,
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
		if (patchToolCall(children, toolCallId, seq, patch)) {
			items[i] = { ...item, children, endSeq: seq };
			return true;
		}
	}
	return false;
}

/** Append a tool item — under its Task parent when the tag resolves, else top-level. */
function insertToolCall(
	items: TimelineItem[],
	item: ToolCallItem,
	parentToolCallId: string | null,
	seq: number,
): void {
	if (
		parentToolCallId &&
		patchToolCall(items, parentToolCallId, seq, (parent) => ({
			...parent,
			children: [...parent.children, item],
			endSeq: seq,
		}))
	) {
		return;
	}
	items.push(item);
}

function hasToolCall(items: TimelineItem[], toolCallId: string): boolean {
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		if (item?.kind !== "tool_call") continue;
		if (item.id === toolCallId) return true;
		if (item.children.length > 0 && hasToolCall(item.children, toolCallId)) {
			return true;
		}
	}
	return false;
}

function resolvePermission(
	items: TimelineItem[],
	requestId: string,
	outcome: RequestPermissionOutcome,
	seq: number,
): boolean {
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		if (item?.kind !== "tool_call") continue;
		const index = item.permissions.findIndex((p) => p.requestId === requestId);
		if (index !== -1) {
			const target = item.permissions[index];
			if (!target) return false;
			const permissions = [...item.permissions];
			permissions[index] = { ...target, resolution: outcome };
			items[i] = { ...item, permissions, endSeq: seq };
			return true;
		}
		if (item.children.length === 0) continue;
		const children = [...item.children];
		if (resolvePermission(children, requestId, outcome, seq)) {
			items[i] = { ...item, children, endSeq: seq };
			return true;
		}
	}
	return false;
}

function findOpenPlan(items: TimelineItem[]): PlanItem | undefined {
	for (let i = items.length - 1; i >= 0; i--) {
		const item = items[i];
		if (item?.kind === "plan" && !item.removed) return item;
	}
	return undefined;
}

function extractPlanEntries(plan: unknown): PlanEntry[] | null {
	if (
		typeof plan === "object" &&
		plan !== null &&
		"entries" in plan &&
		Array.isArray((plan as { entries: unknown }).entries)
	) {
		return (plan as { entries: PlanEntry[] }).entries;
	}
	return null;
}

function replaceItem(
	items: TimelineItem[],
	previous: TimelineItem,
	next: TimelineItem,
): void {
	const index = items.indexOf(previous);
	if (index !== -1) items[index] = next;
}
