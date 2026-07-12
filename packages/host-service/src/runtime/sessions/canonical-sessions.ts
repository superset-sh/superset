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
import {
	AcpSessionEventTranslator,
	acpMainThreadId,
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

/** Result of a cursor-based catch-up read against one session's event log. */
export type SessionReplay =
	| { ok: true; events: SessionEvent[]; head: string }
	| { ok: false; reason: "untracked" | "unknown_cursor" };

/** The tRPC host snapshot minus `head`, which the sync hub owns. */
export type HostSnapshotData = Omit<HostSnapshot, "head">;

interface TrackedSession {
	sessionId: string;
	workspaceId: string;
	translator: AcpSessionEventTranslator;
	/** The canonical log, cursor-stamped. In-memory until the durable store. */
	events: SessionEvent[];
	eventIndexById: Map<string, number>;
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

function cursorFor(serial: number): string {
	return `c${String(serial).padStart(12, "0")}`;
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
 * lives in memory for now — the durable store replaces `events[]` without
 * changing this surface.
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
	}

	// -------------------------------------------------------------------------
	// Queries
	// -------------------------------------------------------------------------

	async getSession(input: GetSessionInput): Promise<SessionSnapshot> {
		const tracked = await this.ensureTracked(input.sessionId, {
			resurrect: false,
		});
		if (!tracked) {
			// Offline stays offline on a read: synthesize the passive snapshot.
			// Subscribing from the zero head resurrects via the hub and streams
			// the whole replayed transcript, so nothing is lost by the empty tail.
			const state = this.port.get(input.sessionId);
			return {
				session: this.synthesizeSession(state),
				threads: [synthesizeMainThread(state)],
				activeTurns: [],
				pendingPermissions: [],
				openToolCalls: [],
				recentEvents: [],
				hasOlderEvents: false,
				head: cursorFor(0),
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
			head: tracked.events[tracked.events.length - 1]?.cursor ?? cursorFor(0),
		};
	}

	/**
	 * Backwards-only scrollback. No cursor = the newest window; page older by
	 * passing `range.oldest.cursor` back. Forward catch-up is the sync
	 * socket's job, never this query's.
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
			head: tracked.events[tracked.events.length - 1]?.cursor ?? cursorFor(0),
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
				this.overrides.set(sessionId, {
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
			this.overrides.set(input.sessionId, {
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
		return tracked.events[tracked.events.length - 1]?.cursor ?? cursorFor(0);
	}

	/**
	 * Events strictly after `after` (null or the zero cursor = everything).
	 * `unknown_cursor` covers cursors from a previous host process or beyond
	 * our truncated head — the caller answers with a protocol reset.
	 */
	sessionReplay(sessionId: string, after: string | null): SessionReplay {
		const tracked = this.tracked.get(sessionId);
		if (!tracked) return { ok: false, reason: "untracked" };
		const head =
			tracked.events[tracked.events.length - 1]?.cursor ?? cursorFor(0);
		if (after === null || after === cursorFor(0)) {
			return { ok: true, events: [...tracked.events], head };
		}
		const index = tracked.events.findIndex((event) => event.cursor === after);
		if (index === -1) return { ok: false, reason: "unknown_cursor" };
		return { ok: true, events: tracked.events.slice(index + 1), head };
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
	 * buffers only a bounded tail, so a long transcript replays truncated;
	 * the durable canonical store is what eventually makes rebuilds lossless.
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
			events: [],
			eventIndexById: new Map(),
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
			tracked.cursorSerial += 1;
			const event: SessionEvent = {
				...draft,
				cursor: cursorFor(tracked.cursorSerial),
			};
			tracked.events.push(event);
			tracked.eventIndexById.set(event.id, tracked.events.length - 1);
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
	}

	// -------------------------------------------------------------------------
	// Composition
	// -------------------------------------------------------------------------

	private baselineProjection(state: SessionScopedState): SessionProjection {
		const mainThreadId = acpMainThreadId(state.sessionId);
		return {
			sessionId: state.sessionId,
			cursor: cursorFor(0),
			session: {
				id: state.sessionId,
				workspaceId: state.workspaceId,
				title: state.title,
				mainThreadId,
				agent: { ...CLAUDE_AGENT },
				runState: mapStatusToRunState(state.status),
				capabilities: { ...ACP_CAPABILITIES },
				settings: settingsFromScopedState(state),
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
