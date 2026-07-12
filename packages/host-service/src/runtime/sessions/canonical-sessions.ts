import { randomUUID } from "node:crypto";
import {
	reduceProjection,
	type SessionProjection,
} from "@superset/host-service-sync/projection";
import type {
	CancelTurnInput,
	CancelTurnReceipt,
	ContentBlock,
	CreateSessionInput,
	CreateSessionResult,
	EventsWindow,
	GetEventsInput,
	GetSessionInput,
	HostSnapshot,
	PermissionRequest,
	ResolvePermissionInput,
	ResolvePermissionReceipt,
	ResolveToolCallInput,
	ResolveToolCallReceipt,
	Session,
	SessionCapabilities,
	SessionEvent,
	SessionSnapshot,
	SubmitTurnInput,
	SubmitTurnReceipt,
	Thread,
	UpdateSessionInput,
	UpdateSessionReceipt,
} from "@superset/host-service-sync/protocol";
import type {
	ContentBlock as AcpContentBlock,
	StopReason as AcpStopReason,
	RequestPermissionOutcome,
	SessionConfigOption,
	SessionScopedState,
	SessionUpdateEnvelope,
} from "@superset/session-protocol";
import { makeSelectedOutcome } from "@superset/session-protocol";
import type { SessionMetaStore } from "./session-meta-store";
import {
	AcpSessionEventTranslator,
	acpMainThreadId,
	type SessionEventDraft,
	settingOptionsFromScopedState,
	settingsFromScopedState,
} from "./translate-acp";

/**
 * The narrow slice of `AcpSessionManager` the canonical runtime consumes.
 * Structural, so deterministic fakes can drive the runtime in tests without
 * spawning adapters. Every member matches the manager's signature exactly.
 */
export interface AcpSessionsPort {
	create(input: {
		sessionId: string;
		workspaceId: string;
	}): Promise<SessionScopedState>;
	get(sessionId: string): SessionScopedState;
	ensureLive(sessionId: string): Promise<void>;
	list(input: { workspaceId?: string; cursor?: string; limit?: number }): {
		items: SessionScopedState[];
		nextCursor: string | null;
	};
	prompt(input: { sessionId: string; prompt: AcpContentBlock[] }): {
		accepted: true;
		turn: Promise<{ stopReason: AcpStopReason }>;
	};
	respondToPermission(input: {
		sessionId: string;
		requestId: string;
		outcome: RequestPermissionOutcome;
	}): { status: "resolved" | "already_resolved" };
	cancel(input: { sessionId: string }): Promise<void>;
	setMode(input: { sessionId: string; modeId: string }): Promise<void>;
	setConfigOption(input: {
		sessionId: string;
		configId: string;
		value: string | boolean;
	}): Promise<void>;
	subscribe(input: {
		sessionId: string;
		since?: number;
		onEnvelope: (envelope: SessionUpdateEnvelope) => void;
	}): () => void;
}

export type CanonicalSessionsErrorCode =
	| "NOT_FOUND"
	| "BAD_REQUEST"
	| "NOT_IMPLEMENTED"
	| "PRECONDITION_FAILED"
	| "CONFLICT"
	| "INTERNAL";

/** Transport-agnostic failure; the tRPC router maps codes onto TRPCError. */
export class CanonicalSessionsError extends Error {
	constructor(
		readonly code: CanonicalSessionsErrorCode,
		message: string,
	) {
		super(message);
		this.name = "CanonicalSessionsError";
	}
}

export interface CanonicalSessionsRuntimeOptions {
	port: AcpSessionsPort;
	/** Injectable for deterministic tests; stamps archivedAt/closedAt only. */
	now?: () => number;
	/** Injectable for deterministic tests; mints createSession ids. */
	mintSessionId?: () => string;
	/**
	 * Durable top-level session metadata (title/archive/close overrides).
	 * Deliberately metadata-only: conversation content is NEVER persisted
	 * here — the vendor transcript is the source of truth, resumed via the
	 * native session id — so the canonical event log stays in memory and is
	 * rebuilt from vendor replay under a fresh generation on every track.
	 */
	metaStore?: SessionMetaStore;
	/** Injectable for deterministic tests; mints log generation tags. */
	mintGeneration?: () => string;
}

/**
 * A change to the host-stream view (plans/host-sessions-sync.md): session
 * rows entering/leaving/updating within the not-archived-not-closed scope,
 * plus attention-worthy permission transitions. The sync hub turns these into
 * host-stream `event` packets with its own cursor sequence.
 */
export type HostChange =
	| { type: "sessionUpsert"; sessionId: string; session: Session }
	| {
			type: "sessionRemoved";
			sessionId: string;
			reason: "archived" | "closed" | "deleted";
	  }
	| {
			type: "permissionAvailable";
			sessionId: string;
			threadId: string;
			permission: PermissionRequest;
	  }
	| { type: "permissionResolved"; sessionId: string; permissionId: string };

/**
 * Result of a cursor-based catch-up read against one session's event log.
 * `foreign_cursor` = the cursor belongs to a dead log generation (or a
 * future serial) — irrecoverable per-cursor, the client rebuilds from the
 * snapshot cold path.
 */
export type SessionReplay =
	| { ok: true; events: SessionEvent[]; head: string }
	| { ok: false; reason: "untracked" | "foreign_cursor" };

/** The tRPC host snapshot minus `head`, which the sync hub owns. */
export type HostSnapshotData = Omit<HostSnapshot, "head">;

interface TrackedSession {
	sessionId: string;
	workspaceId: string;
	translator: AcpSessionEventTranslator;
	/**
	 * Cursor namespace tag for one lifetime of this in-memory log. Minted
	 * fresh on every track: the log is rebuilt from vendor replay each time,
	 * so cursors from a previous tracking (a dead host process) must fail
	 * deterministically instead of aliasing serials in the new log.
	 */
	generation: string;
	/** The canonical log, cursor-stamped. In-memory; content is never
	 *  persisted — the vendor transcript is the source of truth. */
	events: SessionEvent[];
	projection: SessionProjection;
	cursorSerial: number;
	lastSeq: number;
	unsubscribe: () => void;
	/**
	 * The journal head was evicted before we attached, so events cover only
	 * what streamed after tracking began. Pre-attach pendings are unknowable.
	 */
	resetSeen: boolean;
	foldError: string | null;
}

/** Host-side edits the adapter has no notion of; survive untracked sessions. */
interface SessionOverrides {
	title?: string | null;
	archivedAt: number | null;
	closedAt: number | null;
}

const CLAUDE_AGENT = { id: "claude-code", displayName: "Claude Code" };

const ACP_CAPABILITIES: SessionCapabilities = {
	threadModel: "nested",
	threadFidelity: "partial",
	canResume: true,
	supportsPermissions: true,
	supportsModes: true,
	supportsModels: true,
};

const MAX_RECEIPTS = 10_000;
const DEFAULT_PAGE_LIMIT = 50;
/** Events in the `get` snapshot tail — one round trip paints the recent
 *  conversation; older content is getEvents territory. */
const SNAPSHOT_TAIL_LIMIT = 50;
const DEFAULT_EVENT_PAGE_LIMIT = 100;

/**
 * The generation-less "from the very beginning" cursor. It is the head of a
 * never-tracked session's synthesized snapshot, and subscribing after it is
 * always servable when the log's own start is still retained.
 */
const ZERO_CURSOR = "c000000000000";

/**
 * Minted cursors are `c<generation>-<serial>`: the generation tags one
 * lifetime of the log, so a cursor from a dead generation fails parsing
 * deterministically (reset → snapshot rebuild) instead of silently aliasing
 * a serial in the new log. Within a generation the padded serial keeps
 * lexicographic order = numeric order, which the sync hub's replay/live
 * handoff compare relies on.
 */
function mintCursor(generation: string, serial: number): string {
	return `c${generation}-${String(serial).padStart(12, "0")}`;
}

const CURSOR_PATTERN = /^c([a-z0-9]{1,32})-(\d{12})$/;

function parseCursor(
	cursor: string,
): { generation: string; serial: number } | "zero" | null {
	if (cursor === ZERO_CURSOR) return "zero";
	const match = CURSOR_PATTERN.exec(cursor);
	const generation = match?.[1];
	const serial = match?.[2];
	if (generation === undefined || serial === undefined) return null;
	return { generation, serial: Number(serial) };
}

function mapStatusToRunState(
	status: SessionScopedState["status"],
): Session["runState"] {
	switch (status) {
		case "starting":
			return "starting";
		case "idle":
			return "idle";
		case "running":
		case "awaiting_permission":
			return "running";
		case "offline":
			return "offline";
		case "dead":
			return "failed";
		default:
			status satisfies never;
			return "idle";
	}
}

function synthesizeMainThread(state: SessionScopedState): Thread {
	return {
		id: acpMainThreadId(state.sessionId),
		sessionId: state.sessionId,
		kind: "main",
		parentThreadId: null,
		origin: { type: "sessionCreated" },
		fidelity: "full",
		title: null,
		runState: "idle",
		eventHead: null,
		createdAt: state.createdAt,
		updatedAt: state.updatedAt,
		lastActivityAt: state.updatedAt,
	};
}

function toAcpContentBlock(block: ContentBlock): AcpContentBlock {
	switch (block.type) {
		case "text":
			return { type: "text", text: block.text };
		case "thought":
			throw new CanonicalSessionsError(
				"BAD_REQUEST",
				"thought blocks cannot be submitted as user content",
			);
		case "image":
			return { type: "image", mimeType: block.mimeType, data: block.data };
		case "resource":
			return {
				type: "resource_link",
				uri: block.uri,
				name: block.name ?? block.uri,
				...(block.mimeType !== null ? { mimeType: block.mimeType } : {}),
			};
		default:
			block satisfies never;
			throw new CanonicalSessionsError("BAD_REQUEST", "unknown content block");
	}
}

/**
 * The canonical `sessions.*` runtime: composes the ACP session manager (via
 * `AcpSessionsPort`) with the per-session translator into the protocol's
 * canonical entities — a cursor-stamped `SessionEvent` log plus a projection
 * folded through the shared reducer, exactly what clients fold themselves.
 *
 * Ownership split:
 * - the manager owns adapter processes, journals, and liveness;
 * - the translator owns ACP → canonical normalization (deterministic);
 * - this runtime owns tracking (subscribing a translator per session),
 *   cursor assignment, requestId idempotency receipts, and host-side session
 *   edits (title/archive/close) the adapter has no notion of.
 *
 * Mutation outputs are admission receipts, never completion; completion
 * arrives as events whose `causationId` echoes the requestId. The event log
 * lives in memory only — content is deliberately never persisted (the
 * vendor transcript is the source of truth, resumed via the native session
 * id); what persists is the top-level session metadata in the
 * {@link SessionMetaStore} (title/archive/close overrides), so
 * sidebar state survives host restarts.
 *
 * Tracking is lazy. Sessions the manager knows but this runtime has not yet
 * touched (offline rows from before a restart, sessions created through the
 * legacy acpSessions router) are synthesized from `SessionScopedState` in
 * list/get responses — with empty attention, since permission linkage only
 * exists once tracked. Live-path mutations resurrect and track on demand.
 */
export class CanonicalSessionsRuntime {
	private readonly port: AcpSessionsPort;
	private readonly now: () => number;
	private readonly mintSessionId: () => string;
	private readonly metaStore: SessionMetaStore | undefined;
	private readonly mintGeneration: () => string;

	private readonly tracked = new Map<string, TrackedSession>();
	private readonly incarnations = new Map<string, number>();
	private readonly overrides = new Map<string, SessionOverrides>();
	/** `${procedure}:${requestId}` → in-flight/settled admission, FIFO-bounded. */
	private readonly receipts = new Map<
		string,
		{ fingerprint: string; promise: Promise<unknown> }
	>();

	private readonly sessionEventListeners = new Set<
		(event: SessionEvent) => void
	>();
	private readonly hostChangeListeners = new Set<
		(change: HostChange) => void
	>();
	private readonly dirtySessions = new Set<string>();
	private dirtyFlushScheduled = false;

	constructor(options: CanonicalSessionsRuntimeOptions) {
		this.port = options.port;
		this.now = options.now ?? Date.now;
		this.mintSessionId =
			options.mintSessionId ?? (() => `session-${randomUUID()}`);
		this.metaStore = options.metaStore;
		this.mintGeneration =
			options.mintGeneration ?? (() => randomUUID().slice(0, 8));
		if (this.metaStore) {
			try {
				for (const record of this.metaStore.loadAll()) {
					this.overrides.set(record.sessionId, {
						...(record.titleOverridden ? { title: record.title } : {}),
						archivedAt: record.archivedAt,
						closedAt: record.closedAt,
					});
				}
			} catch (error) {
				console.warn(
					"[sessions] failed to load persisted session metadata",
					error,
				);
			}
		}
	}

	// -------------------------------------------------------------------------
	// Queries
	// -------------------------------------------------------------------------

	async getSession(input: GetSessionInput): Promise<SessionSnapshot> {
		// Resurrect on read: this snapshot IS a device's cold first paint, and
		// it must carry the recent tail in ONE response. The old zero-head
		// fallback made the hub resurrect moments later anyway — and then
		// stream the ENTIRE replayed transcript event-by-event over the
		// socket, so the thread visibly built up from the first message.
		// Same session/load work, done here, returns the last page atomically.
		let tracked: TrackedSession | null;
		try {
			tracked = await this.ensureTracked(input.sessionId, {
				resurrect: true,
			});
		} catch {
			// Resurrection failed (transcript unloadable, adapter refused):
			// fall back to the passive snapshot — subscribing from the zero
			// head stays the last-resort recovery. Unknown ids re-throw
			// NotFound from the port read below.
			tracked = this.tracked.get(input.sessionId) ?? null;
		}
		if (!tracked) {
			const state = this.port.get(input.sessionId);
			return {
				session: this.synthesizeSession(state),
				threads: [synthesizeMainThread(state)],
				activeTurns: [],
				pendingPermissions: [],
				openToolCalls: [],
				recentEvents: [],
				hasOlderEvents: false,
				head: ZERO_CURSOR,
			};
		}
		const recentEvents = tracked.events.slice(-SNAPSHOT_TAIL_LIMIT);
		return {
			session: this.composeSession(tracked, this.port.get(input.sessionId)),
			threads: Object.values(tracked.projection.threadsById),
			activeTurns: Object.values(tracked.projection.activeTurnsById),
			pendingPermissions: Object.values(
				tracked.projection.pendingPermissionsById,
			),
			// The ACP harness resolves every tool on the host side.
			openToolCalls: Object.values(
				tracked.projection.activeToolCallsById,
			).filter((toolCall) => toolCall.resolver.type === "client"),
			recentEvents,
			hasOlderEvents:
				tracked.events.length > recentEvents.length || tracked.resetSeen,
			head: this.headCursor(tracked),
		};
	}

	/**
	 * Backwards-only scrollback over the in-memory log. No cursor = the
	 * newest window; page older by passing `range.oldest.cursor` back.
	 * Forward catch-up is the sync socket's job, never this query's.
	 */
	async getEvents(input: GetEventsInput): Promise<EventsWindow> {
		const tracked = await this.requireTracked(input.sessionId);
		const threadId = input.threadId ?? null;
		const filtered =
			threadId === null
				? tracked.events
				: tracked.events.filter((event) => event.threadId === threadId);
		const limit = input.limit ?? DEFAULT_EVENT_PAGE_LIMIT;
		let endExclusive = filtered.length;
		if (input.beforeCursor !== undefined) {
			const index = filtered.findIndex(
				(event) => event.cursor === input.beforeCursor,
			);
			if (index === -1) {
				throw new CanonicalSessionsError(
					"NOT_FOUND",
					`Unknown cursor: ${input.beforeCursor}`,
				);
			}
			endExclusive = index;
		}
		const start = Math.max(0, endExclusive - limit);
		const items = filtered.slice(start, endExclusive);
		const first = items[0];
		const last = items[items.length - 1];
		return {
			sessionId: input.sessionId,
			threadId,
			items,
			range: {
				oldest: first
					? {
							eventId: first.id,
							cursor: first.cursor,
							occurredAt: first.occurredAt,
						}
					: null,
				newest: last
					? {
							eventId: last.id,
							cursor: last.cursor,
							occurredAt: last.occurredAt,
						}
					: null,
				hasMoreBefore: start > 0,
				// The log head was lost to journal eviction before tracking began
				// (resetSeen): once a window reaches our oldest event, say so
				// explicitly instead of passing off partial history as complete.
				truncatedBefore: tracked.resetSeen && start === 0,
			},
			head: this.headCursor(tracked),
		};
	}

	// -------------------------------------------------------------------------
	// Mutations — idempotent by requestId; outputs are admission receipts
	// -------------------------------------------------------------------------

	async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
		return this.withReceipt("createSession", input, async () => {
			if (input.agentId !== CLAUDE_AGENT.id) {
				throw new CanonicalSessionsError(
					"NOT_IMPLEMENTED",
					`Unsupported agent: ${input.agentId} (this host speaks ${CLAUDE_AGENT.id})`,
				);
			}
			const sessionId = this.mintSessionId();
			const state = await this.port.create({
				sessionId,
				workspaceId: input.workspaceId,
			});
			const tracked = this.tracked.get(sessionId) ?? this.track(state);
			if (input.title !== null) {
				this.setOverrides(sessionId, {
					...(this.overrides.get(sessionId) ?? {
						archivedAt: null,
						closedAt: null,
					}),
					title: input.title,
				});
			}
			try {
				await this.applySettings(tracked, input.requestId, input.settings);
			} catch {
				// Best-effort on create: the harness may reject unknown options, and
				// the settings_updated events already tell clients what actually took.
			}
			const session = this.composeSession(tracked, this.port.get(sessionId));
			const mainThread = tracked.projection.threadsById[session.mainThreadId];
			if (!mainThread) {
				throw new CanonicalSessionsError(
					"INTERNAL",
					"main thread missing after create",
				);
			}
			return { session, mainThread };
		});
	}

	/**
	 * One patch mutation for title/archive/close and harness settings. Settings
	 * ride the harness config surface and require a live session; pure
	 * host-side edits (title/archive/close) apply to offline rows too.
	 */
	async updateSession(
		input: UpdateSessionInput,
	): Promise<UpdateSessionReceipt> {
		return this.withReceipt("updateSession", input, async () => {
			const settings = input.settings;
			const wantsSettings =
				settings !== undefined &&
				(settings.activeModel !== undefined ||
					settings.activeMode !== undefined ||
					settings.effort !== undefined);
			const tracked = wantsSettings
				? await this.requireTracked(input.sessionId)
				: await this.ensureTracked(input.sessionId, { resurrect: false });
			const previous = this.overrides.get(input.sessionId);
			this.setOverrides(input.sessionId, {
				title: input.title !== undefined ? input.title : previous?.title,
				archivedAt:
					input.archived === undefined
						? (previous?.archivedAt ?? null)
						: input.archived
							? (previous?.archivedAt ?? this.now())
							: null,
				closedAt:
					input.closed === undefined
						? (previous?.closedAt ?? null)
						: input.closed
							? (previous?.closedAt ?? this.now())
							: null,
			});
			if (wantsSettings && tracked) {
				await this.applySettings(tracked, input.requestId, settings);
			}
			const state = this.port.get(input.sessionId);
			const session = tracked
				? this.composeSession(tracked, state)
				: this.synthesizeSession(state);
			this.emitScopeTransition(input.sessionId, previous, session);
			return {
				requestId: input.requestId,
				sessionId: input.sessionId,
				status: "accepted" as const,
			};
		});
	}

	async submitTurn(input: SubmitTurnInput): Promise<SubmitTurnReceipt> {
		return this.withReceipt("submitTurn", input, async () => {
			const tracked = await this.requireTracked(input.sessionId);
			if (this.overrides.get(input.sessionId)?.closedAt != null) {
				throw new CanonicalSessionsError(
					"PRECONDITION_FAILED",
					"Session is closed",
				);
			}
			if (input.threadId !== tracked.translator.mainThreadId) {
				throw new CanonicalSessionsError(
					"BAD_REQUEST",
					"Only the main thread accepts prompts on this harness",
				);
			}
			const prompt = input.content.map(toAcpContentBlock);
			tracked.translator.attributeNextTurn({
				requestId: input.requestId,
				clientInstanceId: null,
			});
			this.port.prompt({ sessionId: input.sessionId, prompt });
			// prompt() journals the user's chunks synchronously before returning, so
			// the translator has already minted (or reused) the turn.
			const turnId =
				tracked.translator.turnIdFor(input.requestId) ??
				tracked.translator.activeTurnId();
			if (!turnId) {
				throw new CanonicalSessionsError(
					"INTERNAL",
					"prompt admitted but no turn was minted",
				);
			}
			return {
				requestId: input.requestId,
				turnId,
				status: "accepted" as const,
			};
		});
	}

	async cancelTurn(input: CancelTurnInput): Promise<CancelTurnReceipt> {
		return this.withReceipt("cancelTurn", input, async () => {
			const tracked = await this.ensureTracked(input.sessionId, {
				resurrect: false,
			});
			if (!tracked || !tracked.translator.knowsTurn(input.turnId)) {
				throw new CanonicalSessionsError(
					"NOT_FOUND",
					`Unknown turn: ${input.turnId}`,
				);
			}
			if (tracked.translator.activeTurnId() === input.turnId) {
				await this.port.cancel({ sessionId: input.sessionId });
			}
			// A turn that already ended: cancellation is an idempotent no-op.
			return {
				requestId: input.requestId,
				turnId: input.turnId,
				status: "accepted" as const,
			};
		});
	}

	async resolvePermission(
		input: ResolvePermissionInput,
	): Promise<ResolvePermissionReceipt> {
		return this.withReceipt("resolvePermission", input, async () => {
			const tracked = await this.ensureTracked(input.sessionId, {
				resurrect: false,
			});
			const nativeRequestId =
				tracked?.translator.nativePermissionRequestId(input.permissionId) ??
				null;
			if (!tracked || nativeRequestId === null) {
				throw new CanonicalSessionsError(
					"NOT_FOUND",
					`No pending permission: ${input.permissionId}`,
				);
			}
			tracked.translator.attributePermissionResolution(
				nativeRequestId,
				input.requestId,
			);
			const outcome: RequestPermissionOutcome =
				input.outcome.type === "selected"
					? makeSelectedOutcome(input.outcome.optionIds)
					: { outcome: "cancelled" };
			// Both "resolved" and "already_resolved" admit the request — the
			// permission_resolved event is the completion either way.
			this.port.respondToPermission({
				sessionId: input.sessionId,
				requestId: nativeRequestId,
				outcome,
			});
			return {
				requestId: input.requestId,
				permissionId: input.permissionId,
				status: "accepted" as const,
			};
		});
	}

	async resolveToolCall(
		input: ResolveToolCallInput,
	): Promise<ResolveToolCallReceipt> {
		const tracked = await this.ensureTracked(input.sessionId, {
			resurrect: false,
		});
		if (tracked?.projection.activeToolCallsById[input.toolCallId]) {
			throw new CanonicalSessionsError(
				"PRECONDITION_FAILED",
				"Tool call is host-resolved; clients cannot resolve it",
			);
		}
		throw new CanonicalSessionsError(
			"NOT_FOUND",
			`Unknown tool call: ${input.toolCallId}`,
		);
	}

	dispose(): void {
		for (const tracked of this.tracked.values()) {
			tracked.unsubscribe();
		}
		this.tracked.clear();
		this.sessionEventListeners.clear();
		this.hostChangeListeners.clear();
		this.dirtySessions.clear();
	}

	// -------------------------------------------------------------------------
	// Sync feed — live listeners and replay accessors for /sessions/sync
	// -------------------------------------------------------------------------

	/** Every canonical event as it folds, across all tracked sessions. */
	onSessionEvent(listener: (event: SessionEvent) => void): () => void {
		this.sessionEventListeners.add(listener);
		return () => {
			this.sessionEventListeners.delete(listener);
		};
	}

	/** Host-stream changes; see {@link HostChange}. */
	onHostChange(listener: (change: HostChange) => void): () => void {
		this.hostChangeListeners.add(listener);
		return () => {
			this.hostChangeListeners.delete(listener);
		};
	}

	/**
	 * Resurrect + track so replay/live accessors can serve the session. The
	 * sync hub calls this before capturing a subscription's replay window.
	 */
	async warmSession(sessionId: string): Promise<void> {
		await this.requireTracked(sessionId);
	}

	sessionHead(sessionId: string): string | null {
		const tracked = this.tracked.get(sessionId);
		if (!tracked) return null;
		return this.headCursor(tracked);
	}

	/**
	 * Events strictly after `after` (null or the zero cursor = everything).
	 * A cursor from a dead log generation — a previous tracking of this
	 * session, in this process or a dead one — or beyond the head is
	 * `foreign_cursor`: the caller answers with a protocol reset and the
	 * client re-runs the snapshot cold path.
	 */
	sessionReplay(sessionId: string, after: string | null): SessionReplay {
		const tracked = this.tracked.get(sessionId);
		if (!tracked) return { ok: false, reason: "untracked" };
		const head = this.headCursor(tracked);
		if (after === null || after === ZERO_CURSOR) {
			return { ok: true, events: [...tracked.events], head };
		}
		const parsed = parseCursor(after);
		if (
			parsed === null ||
			parsed === "zero" ||
			parsed.generation !== tracked.generation ||
			parsed.serial > tracked.cursorSerial
		) {
			return { ok: false, reason: "foreign_cursor" };
		}
		// Serials are 1-based and gapless, so the slice index IS the serial.
		return { ok: true, events: tracked.events.slice(parsed.serial), head };
	}

	/**
	 * The tRPC host snapshot, minus the hub-owned head: every non-archived,
	 * non-closed session the manager knows. Pending permissions come from
	 * tracked sessions only — untracked rows have no permission linkage yet.
	 * The ACP harness resolves every tool host-side, so the client-tool list
	 * is empty by construction.
	 */
	hostSnapshotData(): HostSnapshotData {
		const sessions: Session[] = [];
		const pendingPermissions: PermissionRequest[] = [];
		let cursor: string | undefined;
		do {
			const page = this.port.list({ cursor, limit: DEFAULT_PAGE_LIMIT });
			for (const state of page.items) {
				if (this.outOfScope(state.sessionId)) continue;
				const tracked = this.tracked.get(state.sessionId);
				sessions.push(
					tracked
						? this.composeSession(tracked, state)
						: this.synthesizeSession(state),
				);
				if (tracked) {
					pendingPermissions.push(
						...Object.values(tracked.projection.pendingPermissionsById),
					);
				}
			}
			cursor = page.nextCursor ?? undefined;
		} while (cursor !== undefined);
		return { sessions, pendingPermissions, openClientToolCalls: [] };
	}

	/**
	 * Garbage-collect persisted session metadata whose session no longer
	 * exists in the manager's registry — the delete side of the metadata
	 * store. Run once at startup (app.ts); sessions deleted while the host
	 * runs are collected on the next boot. Best-effort by contract: a
	 * failure must never block serving.
	 */
	sweepOrphanedSessionMeta(): void {
		if (!this.metaStore) return;
		const known = new Set<string>();
		let cursor: string | undefined;
		do {
			const page = this.port.list({ cursor, limit: DEFAULT_PAGE_LIMIT });
			for (const state of page.items) {
				known.add(state.sessionId);
			}
			cursor = page.nextCursor ?? undefined;
		} while (cursor !== undefined);
		for (const sessionId of [...this.overrides.keys()]) {
			if (known.has(sessionId)) continue;
			this.overrides.delete(sessionId);
			this.metaStore.delete(sessionId);
		}
	}

	/** Write an overrides entry through to the metadata store (best-effort). */
	private setOverrides(sessionId: string, overrides: SessionOverrides): void {
		this.overrides.set(sessionId, overrides);
		if (!this.metaStore) return;
		try {
			this.metaStore.upsert({
				sessionId,
				// Same test composeSession applies: undefined = no override
				// (adapter title shows through), null = explicitly cleared.
				titleOverridden: overrides.title !== undefined,
				title: overrides.title ?? null,
				archivedAt: overrides.archivedAt,
				closedAt: overrides.closedAt,
			});
		} catch (error) {
			console.warn(
				`[sessions] failed to persist session metadata for ${sessionId}`,
				error,
			);
		}
	}

	private outOfScope(sessionId: string): boolean {
		const overrides = this.overrides.get(sessionId);
		return overrides?.archivedAt != null || overrides?.closedAt != null;
	}

	private emitHostChange(change: HostChange): void {
		for (const listener of [...this.hostChangeListeners]) {
			try {
				listener(change);
			} catch {
				// Same discipline as session listeners: never poison the fold path.
			}
		}
	}

	/**
	 * Host-stream session_upsert rows coalesce per microtask: a burst of folds
	 * yields one upsert carrying the final composed row, not one per event.
	 */
	private markDirty(sessionId: string): void {
		if (this.hostChangeListeners.size === 0) return;
		this.dirtySessions.add(sessionId);
		if (this.dirtyFlushScheduled) return;
		this.dirtyFlushScheduled = true;
		queueMicrotask(() => {
			this.dirtyFlushScheduled = false;
			const dirty = [...this.dirtySessions];
			this.dirtySessions.clear();
			for (const id of dirty) {
				const tracked = this.tracked.get(id);
				if (!tracked || this.outOfScope(id)) continue;
				let state: SessionScopedState;
				try {
					state = this.port.get(id);
				} catch {
					continue;
				}
				this.emitHostChange({
					type: "sessionUpsert",
					sessionId: id,
					session: this.composeSession(tracked, state),
				});
			}
		});
	}

	/**
	 * updateSession moved a session into or out of the host-stream scope.
	 * Archive/close are runtime overrides that never touch the fold path, so
	 * they need explicit host-change emission.
	 */
	private emitScopeTransition(
		sessionId: string,
		previous: SessionOverrides | undefined,
		session: Session,
	): void {
		const wasInScope =
			(previous?.archivedAt ?? null) === null &&
			(previous?.closedAt ?? null) === null;
		const isInScope = session.archivedAt === null && session.closedAt === null;
		if (wasInScope && !isInScope) {
			this.emitHostChange({
				type: "sessionRemoved",
				sessionId,
				reason: session.closedAt !== null ? "closed" : "archived",
			});
		} else if (isInScope) {
			// Covers re-entry into scope and in-scope edits (title changes).
			this.emitHostChange({ type: "sessionUpsert", sessionId, session });
		}
	}

	// -------------------------------------------------------------------------
	// Tracking
	// -------------------------------------------------------------------------

	/**
	 * Track on demand. Returns null only for offline sessions when
	 * `resurrect` is false (reads synthesize instead); unknown ids throw the
	 * manager's NotFound. Resurrection loads the stored transcript into a
	 * fresh journal for the new translator incarnation — but session/load
	 * buffers only a bounded tail, so a long transcript replays truncated.
	 * The rebuilt log is a new generation: cursors from the previous
	 * tracking reset deterministically into the snapshot cold path.
	 */
	private async ensureTracked(
		sessionId: string,
		options: { resurrect: boolean },
	): Promise<TrackedSession | null> {
		const existing = this.tracked.get(sessionId);
		if (existing) return existing;
		let state = this.port.get(sessionId);
		if (state.status === "offline") {
			if (!options.resurrect) return null;
			await this.port.ensureLive(sessionId);
			const raced = this.tracked.get(sessionId);
			if (raced) return raced;
			state = this.port.get(sessionId);
		}
		return this.track(state);
	}

	private async requireTracked(sessionId: string): Promise<TrackedSession> {
		const tracked = await this.ensureTracked(sessionId, { resurrect: true });
		if (!tracked) {
			throw new CanonicalSessionsError(
				"INTERNAL",
				"resurrection did not yield a live session",
			);
		}
		return tracked;
	}

	private track(state: SessionScopedState): TrackedSession {
		const incarnation = (this.incarnations.get(state.sessionId) ?? 0) + 1;
		this.incarnations.set(state.sessionId, incarnation);
		const tracked: TrackedSession = {
			sessionId: state.sessionId,
			workspaceId: state.workspaceId,
			translator: new AcpSessionEventTranslator({
				sessionId: state.sessionId,
				idScope: `${state.sessionId}-${incarnation}`,
			}),
			// Fresh namespace per tracking: the log is rebuilt from vendor
			// replay, so cursors minted by any previous tracking are foreign
			// by construction and reset deterministically.
			generation: this.mintGeneration(),
			events: [],
			projection: this.baselineProjection(state),
			cursorSerial: 0,
			lastSeq: 0,
			unsubscribe: () => {},
			resetSeen: false,
			foldError: null,
		};
		this.tracked.set(state.sessionId, tracked);
		const onEnvelope = (envelope: SessionUpdateEnvelope) =>
			this.fold(tracked, envelope);
		// With `since: 0` the retained journal replays synchronously before the
		// listener attaches; an evicted head delivers one reset frame and does
		// NOT attach, so re-subscribe live-only in that case (partial history).
		tracked.unsubscribe = this.port.subscribe({
			sessionId: state.sessionId,
			since: 0,
			onEnvelope,
		});
		if (tracked.resetSeen) {
			tracked.unsubscribe = this.port.subscribe({
				sessionId: state.sessionId,
				onEnvelope,
			});
		}
		return tracked;
	}

	private fold(tracked: TrackedSession, envelope: SessionUpdateEnvelope): void {
		if (envelope.frame.kind === "reset") {
			tracked.resetSeen = true;
			return;
		}
		tracked.lastSeq = envelope.seq;
		let drafts: ReturnType<AcpSessionEventTranslator["translate"]>;
		try {
			drafts = tracked.translator.translate(envelope);
		} catch (error) {
			// The subscriber callback runs inside the manager's journal fan-out;
			// a throw here would corrupt unrelated subscribers. Record and skip.
			tracked.foldError =
				error instanceof Error ? error.message : String(error);
			return;
		}
		for (const draft of drafts) {
			this.appendEvent(tracked, draft);
		}
	}

	/** Mint the cursor, fold, and fan out one canonical event. */
	private appendEvent(tracked: TrackedSession, draft: SessionEventDraft): void {
		tracked.cursorSerial += 1;
		const event: SessionEvent = {
			...draft,
			cursor: mintCursor(tracked.generation, tracked.cursorSerial),
		};
		tracked.events.push(event);
		try {
			tracked.projection = reduceProjection(tracked.projection, {
				type: "event",
				cursor: event.cursor,
				value: event,
			});
		} catch (error) {
			tracked.foldError =
				error instanceof Error ? error.message : String(error);
		}
		// The event is in the log regardless of local projection health —
		// clients fold with their own reducer, so they still get it.
		for (const listener of [...this.sessionEventListeners]) {
			try {
				listener(event);
			} catch {
				// Listener faults must not corrupt the journal fan-out this
				// callback runs inside.
			}
		}
		if (event.payload.type === "permissionRequested") {
			this.emitHostChange({
				type: "permissionAvailable",
				sessionId: event.sessionId,
				threadId: event.payload.permission.threadId,
				permission: event.payload.permission,
			});
		} else if (event.payload.type === "permissionResolved") {
			this.emitHostChange({
				type: "permissionResolved",
				sessionId: event.sessionId,
				permissionId: event.payload.permissionId,
			});
		}
		this.markDirty(tracked.sessionId);
	}

	private headCursor(tracked: TrackedSession): string {
		return mintCursor(tracked.generation, tracked.cursorSerial);
	}

	// -------------------------------------------------------------------------
	// Composition
	// -------------------------------------------------------------------------

	private baselineProjection(state: SessionScopedState): SessionProjection {
		const mainThreadId = acpMainThreadId(state.sessionId);
		return {
			sessionId: state.sessionId,
			cursor: ZERO_CURSOR,
			session: {
				id: state.sessionId,
				workspaceId: state.workspaceId,
				title: state.title,
				mainThreadId,
				agent: { ...CLAUDE_AGENT },
				runState: mapStatusToRunState(state.status),
				capabilities: { ...ACP_CAPABILITIES },
				settings: settingsFromScopedState(state),
				settingOptions: settingOptionsFromScopedState(state),
				eventHead: null,
				createdAt: state.createdAt,
				updatedAt: state.updatedAt,
				lastActivityAt: state.updatedAt,
				archivedAt: null,
				closedAt: null,
				error: null,
			},
			threadsById: { [mainThreadId]: synthesizeMainThread(state) },
			activeTurnsById: {},
			pendingPermissionsById: {},
			activeToolCallsById: {},
			plan: [],
		};
	}

	/**
	 * The projection's session plus what events cannot express: host-liveness
	 * (offline/dead ride the manager state, never the log), host-side edits
	 * (title/archive/close), and the live adapter title.
	 */
	private composeSession(
		tracked: TrackedSession,
		state: SessionScopedState,
	): Session {
		const overrides = this.overrides.get(tracked.sessionId);
		const base = tracked.projection.session;
		const closedAt = overrides?.closedAt ?? null;
		return {
			...base,
			// Catalogs are live-state metadata (the projection's copy is frozen at
			// baseline); recompose so option-list rebuilds show through.
			settingOptions: settingOptionsFromScopedState(state),
			title:
				overrides && overrides.title !== undefined
					? overrides.title
					: state.title,
			runState:
				closedAt !== null
					? "closed"
					: state.status === "offline"
						? "offline"
						: state.status === "dead"
							? "failed"
							: base.runState,
			archivedAt: overrides?.archivedAt ?? null,
			closedAt,
		};
	}

	/** A session this runtime never tracked, from manager state alone. */
	private synthesizeSession(state: SessionScopedState): Session {
		const overrides = this.overrides.get(state.sessionId);
		const closedAt = overrides?.closedAt ?? null;
		return {
			id: state.sessionId,
			workspaceId: state.workspaceId,
			title:
				overrides && overrides.title !== undefined
					? overrides.title
					: state.title,
			mainThreadId: acpMainThreadId(state.sessionId),
			agent: { ...CLAUDE_AGENT },
			runState:
				closedAt !== null ? "closed" : mapStatusToRunState(state.status),
			capabilities: { ...ACP_CAPABILITIES },
			settings: settingsFromScopedState(state),
			settingOptions: settingOptionsFromScopedState(state),
			eventHead: null,
			createdAt: state.createdAt,
			updatedAt: state.updatedAt,
			lastActivityAt: state.updatedAt,
			archivedAt: overrides?.archivedAt ?? null,
			closedAt,
			error: null,
		};
	}

	// -------------------------------------------------------------------------
	// Settings
	// -------------------------------------------------------------------------

	/**
	 * Applies a settings batch through the harness config surface. One
	 * causation arming covers the batch: the first settings-bearing state
	 * frame after this carries the requestId.
	 */
	private async applySettings(
		tracked: TrackedSession,
		requestId: string,
		settings: {
			activeModel?: string | null;
			activeMode?: string | null;
			effort?: string | null;
			configuration?: Record<string, unknown>;
		},
	): Promise<void> {
		const { sessionId } = tracked;
		tracked.translator.attributeNextSettingsChange(requestId);
		if (settings.activeMode != null) {
			await this.port.setMode({ sessionId, modeId: settings.activeMode });
		}
		if (settings.activeModel != null) {
			const option = this.findConfigOption(sessionId, "model", "model");
			if (!option) {
				throw new CanonicalSessionsError(
					"NOT_IMPLEMENTED",
					"The harness exposes no model option",
				);
			}
			await this.port.setConfigOption({
				sessionId,
				configId: option.id,
				value: settings.activeModel,
			});
		}
		if (settings.effort != null) {
			const option = this.findConfigOption(
				sessionId,
				"thought_level",
				"effort",
			);
			if (!option) {
				throw new CanonicalSessionsError(
					"NOT_IMPLEMENTED",
					"The harness exposes no effort option",
				);
			}
			await this.port.setConfigOption({
				sessionId,
				configId: option.id,
				value: settings.effort,
			});
		}
		for (const [configId, value] of Object.entries(
			settings.configuration ?? {},
		)) {
			if (typeof value !== "string" && typeof value !== "boolean") {
				throw new CanonicalSessionsError(
					"BAD_REQUEST",
					`Configuration option ${configId} must be a string or boolean`,
				);
			}
			await this.port.setConfigOption({ sessionId, configId, value });
		}
	}

	private findConfigOption(
		sessionId: string,
		category: string,
		id: string,
	): SessionConfigOption | undefined {
		const options = this.port.get(sessionId).configOptions;
		return (
			options.find((option) => option.category === category) ??
			options.find((option) => option.id === id)
		);
	}

	// -------------------------------------------------------------------------
	// Idempotency receipts
	// -------------------------------------------------------------------------

	/**
	 * At-most-once admission per `${procedure}:${requestId}`. The entry is
	 * registered BEFORE execution so a concurrent duplicate joins the in-flight
	 * promise instead of re-executing (two racing createSessions must not mint
	 * two sessions). The full input is fingerprinted: replaying a requestId
	 * with a different payload — including a different sessionId — is a
	 * CONFLICT, never a silent alias onto the first call's receipt. Failed
	 * executions are forgotten so a retry re-runs; the FIFO bound means a
	 * receipt older than MAX_RECEIPTS admissions can re-execute, which the
	 * at-least-once event contract tolerates.
	 */
	private async withReceipt<T>(
		procedure: string,
		input: { requestId: string },
		execute: () => Promise<T>,
	): Promise<T> {
		const key = `${procedure}:${input.requestId}`;
		const fingerprint = JSON.stringify(input);
		const existing = this.receipts.get(key);
		if (existing) {
			if (existing.fingerprint !== fingerprint) {
				throw new CanonicalSessionsError(
					"CONFLICT",
					`requestId ${input.requestId} was already used for a different ${procedure} payload`,
				);
			}
			return existing.promise as Promise<T>;
		}
		const entry = { fingerprint, promise: execute() };
		this.receipts.set(key, entry);
		if (this.receipts.size > MAX_RECEIPTS) {
			const oldest = this.receipts.keys().next().value;
			if (oldest !== undefined) this.receipts.delete(oldest);
		}
		entry.promise.catch(() => {
			if (this.receipts.get(key) === entry) this.receipts.delete(key);
		});
		return entry.promise as Promise<T>;
	}
}
