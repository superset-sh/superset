import type {
	ContentBlock,
	EventId,
	JsonValue,
	PermissionRequest,
	PlanEntry,
	SessionError,
	SessionEventPayload,
	SessionId,
	SessionSettings,
	SettingOption,
	SettingOptionChoice,
	StopReason,
	Thread,
	ThreadId,
	ToolCallState,
	TurnId,
} from "@superset/host-service-sync/protocol";
import type {
	ContentBlock as AcpContentBlock,
	PermissionOptionKind as AcpPermissionOptionKind,
	StopReason as AcpStopReason,
	ToolCallStatus as AcpToolCallStatus,
	PendingPermission,
	RequestPermissionOutcome,
	SessionConfigOption,
	SessionConfigSelectOptions,
	SessionScopedState,
	SessionUpdate,
	SessionUpdateEnvelope,
} from "@superset/session-protocol";
import { selectedOptionIds } from "@superset/session-protocol";

/**
 * A canonical session event minus its `cursor`: the durable log assigns
 * cursors at append time; everything else — including the event id — is
 * minted here so intra-batch references (a subagent thread's
 * `spawnedByEventId`) stay consistent.
 */
export interface SessionEventDraft {
	id: EventId;
	sessionId: SessionId;
	threadId: ThreadId;
	occurredAt: number;
	causationId: string | null;
	payload: SessionEventPayload;
}

/** The main thread id every session's canonical log hangs off. */
export function acpMainThreadId(sessionId: string): ThreadId {
	return `thread-${sessionId}-main`;
}

const SHORT_TEXT_LIMIT = 4_096;
/** Same retention shape as the projection's collection caps. */
const MAX_TRACKED_TOOL_CALLS = 10_000;
const MAX_TRACKED_SUBAGENT_THREADS = 1_000;

const TERMINAL_TOOL_CALL_STATES: ReadonlySet<ToolCallState> = new Set([
	"succeeded",
	"failed",
	"cancelled",
]);

interface TrackedToolCall {
	threadId: ThreadId;
	startedEventId: EventId;
	title: string;
	terminal: boolean;
}

interface ActiveTurn {
	id: TurnId;
	/** requestId of the sendMessage mutation that started it, if attributed. */
	causationId: string | null;
	/** Once the agent has produced output, a fresh top-level user message
	 *  means a new turn (replayed transcripts have no state frames). */
	sawAgentActivity: boolean;
}

interface OpenMessage {
	id: string;
	/** `${role}:${acp messageId | "anon"}` — a change closes the message. */
	groupKey: string;
	role: "user" | "assistant";
	/** Carried by message_started and every delta of this message. */
	causationId: string | null;
}

export interface AcpSessionEventTranslatorOptions {
	sessionId: SessionId;
	/**
	 * Uniqueness scope for minted ids (turns, messages, permissions, events).
	 * The adapter journal restarts seqs at 1 on every resurrection, so the
	 * caller must pass a value that differs per incarnation or minted ids
	 * would collide in the durable log across restarts.
	 */
	idScope: string;
}

/**
 * The private ACP adapter normalization layer: folds the ACP session journal
 * (`SessionUpdateEnvelope`s, in seq order) into canonical `SessionEvent`
 * drafts. Deterministic — every output is a pure function of the envelope
 * stream, the id scope, and the explicit `attribute*` calls; no clocks, no
 * randomness — so the same journal always produces the same canonical log.
 *
 * Semantics ACP does not express are synthesized here:
 * - Turns: opened by the first activity that needs one, closed by the
 *   manager's idle/dead state frames (via lastStopReason/lastError) or an
 *   early `prompt_rejected`.
 * - Subagent threads: `_meta.claudeCode.parentToolUseId` routes child
 *   activity into a partial-fidelity `subagent` thread per Task tool call
 *   (adapter data loss must not become protocol flattening).
 * - Messages: chunk streams are grouped by ACP messageId (role-scoped) and
 *   closed on group change or turn end.
 *
 * Deliberate reductions (documented, not accidental): audio content blocks,
 * usage/available-commands updates, and the UNSTABLE plan_update/plan_removed
 * variants are skipped; tool-call content/location refinements are dropped in
 * favor of rawInput/rawOutput.
 */
export class AcpSessionEventTranslator {
	private readonly sessionId: SessionId;
	private readonly idScope: string;
	readonly mainThreadId: ThreadId;

	private eventSerial = 0;
	private turnSerial = 0;
	private messageSerial = 0;
	private permissionSerial = 0;

	private emittedMainThread = false;
	private activeTurn: ActiveTurn | null = null;
	private lastStatus: SessionScopedState["status"] | null = null;
	private lastSettingsKey: string | null = null;

	private readonly openMessages = new Map<ThreadId, OpenMessage>();
	private readonly toolCalls = new Map<string, TrackedToolCall>();
	private readonly subagentThreads = new Map<string, Thread>();
	private readonly pendingPermissions = new Map<
		string,
		{ publicId: string; threadId: ThreadId; toolCallId: string }
	>();
	private readonly mintedTurnIds = new Set<TurnId>();
	private readonly turnIdsByRequest = new Map<string, TurnId>();

	private nextTurnAttribution: {
		requestId: string | null;
		clientInstanceId: string | null;
	} | null = null;
	private nextSettingsCausation: string | null = null;
	private readonly permissionResolutionCausations = new Map<string, string>();

	constructor(options: AcpSessionEventTranslatorOptions) {
		this.sessionId = options.sessionId;
		this.idScope = options.idScope;
		this.mainThreadId = acpMainThreadId(options.sessionId);
	}

	/** The next synthesized turn (and its user message) carries this origin. */
	attributeNextTurn(attribution: {
		requestId: string | null;
		clientInstanceId: string | null;
	}): void {
		this.nextTurnAttribution = attribution;
	}

	/** The next settings_updated emission carries this requestId. */
	attributeNextSettingsChange(requestId: string): void {
		this.nextSettingsCausation = requestId;
	}

	/** The resolution of this native permission request carries this requestId. */
	attributePermissionResolution(
		nativeRequestId: string,
		requestId: string,
	): void {
		this.permissionResolutionCausations.set(nativeRequestId, requestId);
	}

	/** Public permission id for a native request id, while it is pending. */
	publicPermissionId(nativeRequestId: string): string | null {
		return this.pendingPermissions.get(nativeRequestId)?.publicId ?? null;
	}

	/** Native request id for a public permission id, while it is pending. */
	nativePermissionRequestId(publicPermissionId: string): string | null {
		for (const [nativeRequestId, entry] of this.pendingPermissions) {
			if (entry.publicId === publicPermissionId) return nativeRequestId;
		}
		return null;
	}

	/** The turn a submitTurn requestId's message landed in, if seen yet. */
	turnIdFor(requestId: string): TurnId | null {
		return this.turnIdsByRequest.get(requestId) ?? null;
	}

	activeTurnId(): TurnId | null {
		return this.activeTurn?.id ?? null;
	}

	/** Whether this incarnation ever minted the given turn id. */
	knowsTurn(turnId: string): boolean {
		return this.mintedTurnIds.has(turnId);
	}

	translate(envelope: SessionUpdateEnvelope): SessionEventDraft[] {
		const events: SessionEventDraft[] = [];
		const ts = envelope.ts;
		this.ensureMainThread(events, ts);
		const frame = envelope.frame;
		switch (frame.kind) {
			case "update":
				this.translateUpdate(events, frame.update, ts);
				break;
			case "permission_requested":
				this.translatePermissionRequested(events, frame.pending, ts);
				break;
			case "permission_resolved":
				this.translatePermissionResolved(
					events,
					frame.requestId,
					frame.outcome,
					ts,
				);
				break;
			case "prompt_rejected":
				this.translatePromptRejected(events, frame.reason, ts);
				break;
			case "state":
				this.translateState(events, frame.state, ts);
				break;
			case "reset":
				// A journal-eviction marker for shipping-stream subscribers; the
				// canonical pipeline subscribes from seq 1 and never sees one.
				break;
			default:
				frame satisfies never;
		}
		return events;
	}

	// -------------------------------------------------------------------------
	// ACP session/update variants
	// -------------------------------------------------------------------------

	private translateUpdate(
		events: SessionEventDraft[],
		update: SessionUpdate,
		ts: number,
	): void {
		switch (update.sessionUpdate) {
			case "user_message_chunk":
				this.translateChunk(events, ts, {
					role: "user",
					thought: false,
					content: update.content,
					messageId: update.messageId ?? null,
					parentToolUseId: claudeMeta(update._meta).parentToolUseId,
				});
				break;
			case "agent_message_chunk":
			case "agent_thought_chunk":
				this.translateChunk(events, ts, {
					role: "assistant",
					thought: update.sessionUpdate === "agent_thought_chunk",
					content: update.content,
					messageId: update.messageId ?? null,
					parentToolUseId: claudeMeta(update._meta).parentToolUseId,
				});
				break;
			case "tool_call":
				this.translateToolCall(events, update, ts);
				break;
			case "tool_call_update":
				this.translateToolCallUpdate(events, update, ts);
				break;
			case "plan":
				this.push(events, this.mainThreadId, ts, null, {
					type: "planUpdated",
					plan: update.entries.map(
						(entry, index): PlanEntry => ({
							id: `step-${index + 1}`,
							content: entry.content,
							status:
								entry.status === "in_progress" ? "inProgress" : entry.status,
							priority: entry.priority,
						}),
					),
				});
				break;
			case "session_info_update":
			case "current_mode_update":
			case "config_option_update":
				// Session-level metadata. The manager applies these to scoped state
				// and emits a state frame right after; settings_updated is derived
				// there so client-initiated changes (which have no raw update) and
				// adapter-initiated ones share one path.
				break;
			case "plan_update":
			case "plan_removed":
				// UNSTABLE multi-plan ACP extension the Claude adapter does not
				// emit; the stable `plan` variant carries the whole plan.
				break;
			case "available_commands_update":
			case "usage_update":
				// No canonical counterpart (yet); deliberately skipped.
				break;
			default:
				update satisfies never;
		}
	}

	private translateChunk(
		events: SessionEventDraft[],
		ts: number,
		chunk: {
			role: "user" | "assistant";
			thought: boolean;
			content: AcpContentBlock;
			messageId: string | null;
			parentToolUseId: string | null;
		},
	): void {
		const threadId = this.routeThread(events, chunk.parentToolUseId, ts);
		let userCausation: string | null = null;
		if (chunk.role === "user" && chunk.parentToolUseId === null) {
			// Replayed transcripts carry no state frames, so turn boundaries are
			// recovered here: a fresh top-level user message after agent output
			// ends the previous turn.
			if (this.activeTurn?.sawAgentActivity) {
				this.endTurn(events, ts, {
					type: "turnCompleted",
					stopReason: "other",
				});
			}
			const hadTurn = this.activeTurn !== null;
			const turn = this.ensureTurn(events, ts);
			if (hadTurn) {
				// A second prompt admitted into a turn that has produced no agent
				// output yet: its message rides the already-open turn, but keeps
				// its own request attribution and starts a fresh user message.
				const attribution = this.nextTurnAttribution;
				this.nextTurnAttribution = null;
				if (attribution?.requestId) {
					this.turnIdsByRequest.set(attribution.requestId, turn.id);
					userCausation = attribution.requestId;
					if (this.openMessages.get(threadId)?.role === "user") {
						this.closeMessage(events, threadId, ts);
					}
				}
			} else {
				userCausation = turn.causationId;
			}
		} else {
			const turn = this.ensureTurn(events, ts);
			turn.sawAgentActivity = true;
		}
		const turn = this.activeTurn;
		if (!turn) return;

		const groupKey = `${chunk.role}:${chunk.messageId ?? "anon"}`;
		const open = this.openMessages.get(threadId);
		if (open && open.groupKey !== groupKey) {
			this.closeMessage(events, threadId, ts);
		}
		let message = this.openMessages.get(threadId);
		if (!message) {
			message = {
				id: `message-${this.idScope}-${++this.messageSerial}`,
				groupKey,
				role: chunk.role,
				causationId: chunk.role === "user" ? userCausation : null,
			};
			this.openMessages.set(threadId, message);
			this.push(events, threadId, ts, message.causationId, {
				type: "messageStarted",
				message: {
					id: message.id,
					sessionId: this.sessionId,
					threadId,
					turnId: turn.id,
					role: chunk.role,
					content: [],
					createdAt: ts,
				},
			});
		}
		const content = mapContentBlock(chunk.content, chunk.thought);
		if (content) {
			this.push(events, threadId, ts, message.causationId, {
				type: "messageDelta",
				messageId: message.id,
				content,
			});
		}
	}

	private translateToolCall(
		events: SessionEventDraft[],
		update: Extract<SessionUpdate, { sessionUpdate: "tool_call" }>,
		ts: number,
	): void {
		const meta = claudeMeta(update._meta);
		const threadId = this.routeThread(events, meta.parentToolUseId, ts);
		const turn = this.ensureTurn(events, ts);
		turn.sawAgentActivity = true;
		const known = this.toolCalls.get(update.toolCallId);
		if (known && !known.terminal) {
			// The adapter re-announces a tool call it already surfaced (its
			// permission flow's ensureToolCallEmitted); treat as a refinement.
			known.title = truncate(update.title);
			this.push(events, known.threadId, ts, null, {
				type: "toolCallUpdated",
				toolCallId: update.toolCallId,
				update: {
					title: truncate(update.title),
					...(update.rawInput !== undefined
						? { input: toJsonValue(update.rawInput) }
						: {}),
					...(update.status ? { state: mapToolCallStatus(update.status) } : {}),
					updatedAt: ts,
				},
			});
			return;
		}
		const startedEventId = this.mintEventId();
		const state = mapToolCallStatus(update.status ?? "pending");
		this.trackToolCall(update.toolCallId, {
			threadId,
			startedEventId,
			title: truncate(update.title),
			terminal: TERMINAL_TOOL_CALL_STATES.has(state),
		});
		events.push({
			id: startedEventId,
			sessionId: this.sessionId,
			threadId,
			occurredAt: ts,
			causationId: null,
			payload: {
				type: "toolCallStarted",
				toolCall: {
					id: update.toolCallId,
					sessionId: this.sessionId,
					threadId,
					turnId: turn.id,
					parentToolCallId: meta.parentToolUseId,
					tool: {
						name: meta.toolName ?? `acp.${update.kind ?? "other"}`,
						version: 1,
					},
					title: truncate(update.title),
					input: toJsonValue(update.rawInput) ?? null,
					resolver: { type: "host" },
					state,
					createdAt: ts,
					updatedAt: ts,
					expiresAt: null,
				},
			},
		});
	}

	private translateToolCallUpdate(
		events: SessionEventDraft[],
		update: Extract<SessionUpdate, { sessionUpdate: "tool_call_update" }>,
		ts: number,
	): void {
		const meta = claudeMeta(update._meta);
		const known = this.toolCalls.get(update.toolCallId);
		const threadId =
			known?.threadId ?? this.routeThread(events, meta.parentToolUseId, ts);
		const state =
			update.status !== null && update.status !== undefined
				? mapToolCallStatus(update.status)
				: undefined;
		this.push(events, threadId, ts, null, {
			type: "toolCallUpdated",
			toolCallId: update.toolCallId,
			update: {
				...(update.title !== null && update.title !== undefined
					? { title: truncate(update.title) }
					: {}),
				...(update.rawInput !== undefined
					? { input: toJsonValue(update.rawInput) }
					: {}),
				...(update.rawOutput !== undefined
					? { output: toJsonValue(update.rawOutput) }
					: {}),
				...(state ? { state } : {}),
				updatedAt: ts,
			},
		});
		if (known && state && TERMINAL_TOOL_CALL_STATES.has(state)) {
			known.terminal = true;
			this.finishSubagentThread(events, update.toolCallId, state, ts);
		}
	}

	// -------------------------------------------------------------------------
	// Permission frames
	// -------------------------------------------------------------------------

	private translatePermissionRequested(
		events: SessionEventDraft[],
		pending: PendingPermission,
		ts: number,
	): void {
		const turn = this.ensureTurn(events, ts);
		turn.sawAgentActivity = true;
		const toolCallId = pending.toolCall.toolCallId;
		const known = this.toolCalls.get(toolCallId);
		let threadId: ThreadId;
		if (known) {
			threadId = known.threadId;
			if (!known.terminal) {
				this.push(events, threadId, ts, null, {
					type: "toolCallUpdated",
					toolCallId,
					update: {
						state: "awaitingPermission",
						...(typeof pending.toolCall.title === "string" &&
						truncate(pending.toolCall.title) !== known.title
							? { title: truncate(pending.toolCall.title) }
							: {}),
						updatedAt: ts,
					},
				});
			}
		} else {
			// No adapter tool call exists (a synthetic question card from a form
			// elicitation): synthesize one so the question text has a home.
			threadId = this.mainThreadId;
			const startedEventId = this.mintEventId();
			const title = truncate(
				typeof pending.toolCall.title === "string"
					? pending.toolCall.title
					: "Question",
			);
			this.trackToolCall(toolCallId, {
				threadId,
				startedEventId,
				title,
				terminal: false,
			});
			events.push({
				id: startedEventId,
				sessionId: this.sessionId,
				threadId,
				occurredAt: ts,
				causationId: null,
				payload: {
					type: "toolCallStarted",
					toolCall: {
						id: toolCallId,
						sessionId: this.sessionId,
						threadId,
						turnId: turn.id,
						parentToolCallId: null,
						tool: { name: "ui.question", version: 1 },
						title,
						input: toJsonValue(pending.toolCall.rawInput) ?? null,
						resolver: { type: "host" },
						state: "awaitingPermission",
						createdAt: ts,
						updatedAt: ts,
						expiresAt: null,
					},
				},
			});
		}
		const publicId = `permission-${this.idScope}-${++this.permissionSerial}`;
		this.pendingPermissions.set(pending.requestId, {
			publicId,
			threadId,
			toolCallId,
		});
		const permission: PermissionRequest = {
			id: publicId,
			sessionId: this.sessionId,
			threadId,
			toolCallId,
			options: pending.options.map((option) => ({
				id: option.optionId,
				name: option.name,
				kind: mapPermissionOptionKind(option.kind),
			})),
			multiSelect: pending.multiSelect ?? false,
			requestedAt: pending.requestedAt,
		};
		this.push(events, threadId, ts, null, {
			type: "permissionRequested",
			permission,
		});
	}

	private translatePermissionResolved(
		events: SessionEventDraft[],
		nativeRequestId: string,
		outcome: RequestPermissionOutcome,
		ts: number,
	): void {
		const entry = this.pendingPermissions.get(nativeRequestId);
		if (!entry) return;
		this.pendingPermissions.delete(nativeRequestId);
		const causationId =
			this.permissionResolutionCausations.get(nativeRequestId) ?? null;
		this.permissionResolutionCausations.delete(nativeRequestId);
		this.push(events, entry.threadId, ts, causationId, {
			type: "permissionResolved",
			permissionId: entry.publicId,
			outcome:
				outcome.outcome === "selected"
					? { type: "selected", optionIds: selectedOptionIds(outcome) }
					: { type: "cancelled" },
		});
	}

	// -------------------------------------------------------------------------
	// Turn lifecycle
	// -------------------------------------------------------------------------

	private translatePromptRejected(
		events: SessionEventDraft[],
		reason: string,
		ts: number,
	): void {
		const error = mapReasonToError(reason, ts);
		if (this.activeTurn) {
			this.endTurn(events, ts, { type: "turnFailed", error });
		} else {
			this.push(events, this.mainThreadId, ts, null, { type: "error", error });
		}
	}

	private translateState(
		events: SessionEventDraft[],
		state: SessionScopedState,
		ts: number,
	): void {
		const settings = settingsFromScopedState(state);
		// The catalogs are part of the change key even though the event carries
		// only values: a catalog-only rebuild (e.g. the effort list after a model
		// switch) must still append an event, because the composed session — the
		// catalogs' actual carrier — is only re-pushed when the log moves.
		const settingsKey = JSON.stringify([
			settings,
			settingOptionsFromScopedState(state),
		]);
		if (settingsKey !== this.lastSettingsKey) {
			this.lastSettingsKey = settingsKey;
			const causationId = this.nextSettingsCausation;
			this.nextSettingsCausation = null;
			this.push(events, this.mainThreadId, ts, causationId, {
				type: "settingsUpdated",
				settings,
			});
		}

		if (state.status === "running" && !this.activeTurn) {
			this.startTurn(events, ts);
		} else if (
			(state.status === "idle" || state.status === "dead") &&
			this.activeTurn
		) {
			if (state.status === "dead") {
				this.endTurn(events, ts, {
					type: "turnFailed",
					error: adapterDeadError(ts),
				});
			} else if (state.lastError !== null) {
				this.endTurn(events, ts, {
					type: "turnFailed",
					error: mapReasonToError(state.lastError, ts),
				});
			} else if (state.lastStopReason === "cancelled") {
				this.endTurn(events, ts, { type: "turnCancelled" });
			} else {
				this.endTurn(events, ts, {
					type: "turnCompleted",
					stopReason: mapStopReason(state.lastStopReason),
				});
			}
		} else if (
			state.status === "dead" &&
			!this.activeTurn &&
			this.lastStatus !== "dead"
		) {
			// The adapter died between turns — surface it even without a turn to
			// fail; the projection carries it as session.error.
			this.push(events, this.mainThreadId, ts, null, {
				type: "error",
				error: adapterDeadError(ts),
			});
		}
		this.lastStatus = state.status;
	}

	private ensureTurn(events: SessionEventDraft[], ts: number): ActiveTurn {
		return this.activeTurn ?? this.startTurn(events, ts);
	}

	private startTurn(events: SessionEventDraft[], ts: number): ActiveTurn {
		const attribution = this.nextTurnAttribution;
		this.nextTurnAttribution = null;
		const turn: ActiveTurn = {
			id: `turn-${this.idScope}-${++this.turnSerial}`,
			causationId: attribution?.requestId ?? null,
			sawAgentActivity: false,
		};
		this.activeTurn = turn;
		this.mintedTurnIds.add(turn.id);
		if (this.mintedTurnIds.size > MAX_TRACKED_TOOL_CALLS) {
			const oldest = this.mintedTurnIds.values().next().value;
			if (oldest !== undefined) this.mintedTurnIds.delete(oldest);
		}
		if (attribution?.requestId) {
			this.turnIdsByRequest.set(attribution.requestId, turn.id);
			if (this.turnIdsByRequest.size > MAX_TRACKED_SUBAGENT_THREADS) {
				const oldest = this.turnIdsByRequest.keys().next().value;
				if (oldest !== undefined) this.turnIdsByRequest.delete(oldest);
			}
		}
		this.push(events, this.mainThreadId, ts, turn.causationId, {
			type: "turnStarted",
			turn: {
				id: turn.id,
				sessionId: this.sessionId,
				threadId: this.mainThreadId,
				status: "running",
				originatingClientInstanceId: attribution?.clientInstanceId ?? null,
				createdAt: ts,
				updatedAt: ts,
			},
		});
		return turn;
	}

	private endTurn(
		events: SessionEventDraft[],
		ts: number,
		ending:
			| { type: "turnCompleted"; stopReason: StopReason }
			| { type: "turnFailed"; error: SessionError }
			| { type: "turnCancelled" },
	): void {
		const turn = this.activeTurn;
		if (!turn) return;
		this.activeTurn = null;
		for (const threadId of [...this.openMessages.keys()]) {
			this.closeMessage(events, threadId, ts);
		}
		this.push(events, this.mainThreadId, ts, null, {
			...ending,
			turnId: turn.id,
		});
	}

	// -------------------------------------------------------------------------
	// Threads and messages
	// -------------------------------------------------------------------------

	private ensureMainThread(events: SessionEventDraft[], ts: number): void {
		if (this.emittedMainThread) return;
		this.emittedMainThread = true;
		this.push(events, this.mainThreadId, ts, null, {
			type: "threadCreated",
			thread: {
				id: this.mainThreadId,
				sessionId: this.sessionId,
				kind: "main",
				parentThreadId: null,
				origin: { type: "sessionCreated" },
				fidelity: "full",
				title: null,
				runState: "idle",
				eventHead: null,
				createdAt: ts,
				updatedAt: ts,
				lastActivityAt: ts,
			},
		});
	}

	/**
	 * Thread for a `_meta.claudeCode.parentToolUseId`, creating the
	 * partial-fidelity subagent thread on first sight. When the parent Task
	 * tool call was never seen (journal eviction), the thread_created event
	 * anchors `spawnedByEventId` to itself — deterministic and schema-valid,
	 * if less precise.
	 */
	private routeThread(
		events: SessionEventDraft[],
		parentToolUseId: string | null,
		ts: number,
	): ThreadId {
		if (parentToolUseId === null) return this.mainThreadId;
		const existing = this.subagentThreads.get(parentToolUseId);
		if (existing) return existing.id;
		const parent = this.toolCalls.get(parentToolUseId);
		const threadId: ThreadId = `thread-sub-${parentToolUseId}`;
		const createdEventId = this.mintEventId();
		const thread: Thread = {
			id: threadId,
			sessionId: this.sessionId,
			kind: "subagent",
			parentThreadId: this.mainThreadId,
			origin: {
				type: "subagent",
				spawnedByEventId: parent?.startedEventId ?? createdEventId,
				spawnedByToolCallId: parentToolUseId,
			},
			// ACP drops subagent assistant text/thinking; only child tool
			// activity survives, so this thread is declared partial.
			fidelity: "partial",
			title: parent?.title ?? null,
			runState: "running",
			eventHead: null,
			createdAt: ts,
			updatedAt: ts,
			lastActivityAt: ts,
		};
		this.trackSubagentThread(parentToolUseId, thread);
		events.push({
			id: createdEventId,
			sessionId: this.sessionId,
			threadId,
			occurredAt: ts,
			causationId: null,
			payload: { type: "threadCreated", thread },
		});
		return threadId;
	}

	private finishSubagentThread(
		events: SessionEventDraft[],
		taskToolCallId: string,
		state: ToolCallState,
		ts: number,
	): void {
		const thread = this.subagentThreads.get(taskToolCallId);
		if (!thread || thread.runState !== "running") return;
		this.closeMessage(events, thread.id, ts);
		const finished: Thread = {
			...thread,
			runState:
				state === "succeeded"
					? "completed"
					: state === "cancelled"
						? "cancelled"
						: "failed",
			updatedAt: ts,
			lastActivityAt: ts,
		};
		this.subagentThreads.set(taskToolCallId, finished);
		this.push(events, thread.id, ts, null, {
			type: "threadUpdated",
			thread: finished,
		});
	}

	private closeMessage(
		events: SessionEventDraft[],
		threadId: ThreadId,
		ts: number,
	): void {
		const open = this.openMessages.get(threadId);
		if (!open) return;
		this.openMessages.delete(threadId);
		this.push(events, threadId, ts, null, {
			type: "messageCompleted",
			messageId: open.id,
		});
	}

	// -------------------------------------------------------------------------
	// Bookkeeping
	// -------------------------------------------------------------------------

	private trackToolCall(toolCallId: string, tracked: TrackedToolCall): void {
		this.toolCalls.set(toolCallId, tracked);
		if (this.toolCalls.size > MAX_TRACKED_TOOL_CALLS) {
			const oldest = this.toolCalls.keys().next().value;
			if (oldest !== undefined) this.toolCalls.delete(oldest);
		}
	}

	private trackSubagentThread(taskToolCallId: string, thread: Thread): void {
		this.subagentThreads.set(taskToolCallId, thread);
		if (this.subagentThreads.size > MAX_TRACKED_SUBAGENT_THREADS) {
			const oldest = this.subagentThreads.keys().next().value;
			if (oldest !== undefined) this.subagentThreads.delete(oldest);
		}
	}

	private mintEventId(): EventId {
		return `event-${this.idScope}-${++this.eventSerial}`;
	}

	private push(
		events: SessionEventDraft[],
		threadId: ThreadId,
		occurredAt: number,
		causationId: string | null,
		payload: SessionEventPayload,
	): void {
		events.push({
			id: this.mintEventId(),
			sessionId: this.sessionId,
			threadId,
			occurredAt,
			causationId,
			payload,
		});
	}
}

// ---------------------------------------------------------------------------
// Pure mapping helpers
// ---------------------------------------------------------------------------

function claudeMeta(meta: unknown): {
	toolName: string | null;
	parentToolUseId: string | null;
} {
	const claude = (
		meta as
			| { claudeCode?: { toolName?: unknown; parentToolUseId?: unknown } }
			| null
			| undefined
	)?.claudeCode;
	return {
		toolName: typeof claude?.toolName === "string" ? claude.toolName : null,
		parentToolUseId:
			typeof claude?.parentToolUseId === "string"
				? claude.parentToolUseId
				: null,
	};
}

function mapContentBlock(
	block: AcpContentBlock,
	thought: boolean,
): ContentBlock | null {
	switch (block.type) {
		case "text":
			return thought
				? { type: "thought", text: block.text }
				: { type: "text", text: block.text };
		case "image":
			return { type: "image", mimeType: block.mimeType, data: block.data };
		case "resource_link":
			return {
				type: "resource",
				uri: block.uri,
				name: block.name ?? null,
				mimeType: block.mimeType ?? null,
			};
		case "resource":
			return {
				type: "resource",
				uri: block.resource.uri,
				name: null,
				mimeType: block.resource.mimeType ?? null,
			};
		case "audio":
			// No canonical audio block; a deliberate reduction, not an accident.
			return null;
		default:
			block satisfies never;
			return null;
	}
}

function mapToolCallStatus(status: AcpToolCallStatus): ToolCallState {
	switch (status) {
		case "pending":
			return "requested";
		case "in_progress":
			return "running";
		case "completed":
			return "succeeded";
		case "failed":
			return "failed";
		default:
			status satisfies never;
			return "failed";
	}
}

function mapStopReason(reason: AcpStopReason | null): StopReason {
	switch (reason) {
		case "end_turn":
			return "endTurn";
		case "max_tokens":
			return "maxTokens";
		case "refusal":
			return "refusal";
		case "cancelled":
			return "cancelled";
		case "max_turn_requests":
		case null:
			return "other";
		default:
			reason satisfies never;
			return "other";
	}
}

function mapPermissionOptionKind(
	kind: AcpPermissionOptionKind | undefined,
): "allowOnce" | "allowAlways" | "rejectOnce" | "rejectAlways" | "other" {
	switch (kind) {
		case "allow_once":
			return "allowOnce";
		case "allow_always":
			return "allowAlways";
		case "reject_once":
			return "rejectOnce";
		case "reject_always":
			return "rejectAlways";
		default:
			return "other";
	}
}

function mapReasonToError(reason: string, occurredAt: number): SessionError {
	if (/auth|login|credential/i.test(reason)) {
		return {
			code: "AUTH_REQUIRED",
			retryable: false,
			recovery: "reauthenticate",
			occurredAt,
		};
	}
	return {
		code: "ADAPTER_PROTOCOL_ERROR",
		retryable: true,
		recovery: "retry",
		occurredAt,
	};
}

function adapterDeadError(occurredAt: number): SessionError {
	return {
		code: "ADAPTER_UNAVAILABLE",
		retryable: false,
		recovery: "startNewSession",
		occurredAt,
	};
}

export function settingsFromScopedState(
	state: SessionScopedState,
): SessionSettings {
	const configuration: Record<string, boolean | string> = {};
	for (const option of state.configOptions) {
		configuration[option.id] = option.currentValue;
	}
	return {
		activeModel: pickConfigValue(state.configOptions, "model", "model"),
		activeMode:
			state.currentMode?.currentModeId ??
			pickConfigValue(state.configOptions, "mode", "mode"),
		effort: pickConfigValue(state.configOptions, "thought_level", "effort"),
		configuration,
	};
}

function pickConfigValue(
	options: SessionConfigOption[],
	category: string,
	id: string,
): string | null {
	const match =
		options.find((option) => option.category === category) ??
		options.find((option) => option.id === id);
	return match && typeof match.currentValue === "string"
		? match.currentValue
		: null;
}

const MAX_SETTING_OPTIONS = 100;
const MAX_SETTING_OPTION_CHOICES = 100;
const MAX_CHOICE_NAME = 1_024;
const MAX_CHOICE_DESCRIPTION = 4_096;
const MAX_CHOICE_VALUE = 256;

/**
 * Settings catalogs for the composed session entity: the harness's select
 * config options with grouped choices flattened, plus a mode catalog
 * synthesized from `currentMode` when the adapter does not mirror it as a
 * config option. Boolean toggles are skipped — a deliberate v1 reduction;
 * `settings.configuration` still carries their current values.
 */
export function settingOptionsFromScopedState(
	state: SessionScopedState,
): SettingOption[] {
	const options: SettingOption[] = [];
	for (const option of state.configOptions) {
		if (option.type !== "select") continue;
		options.push({
			id: option.id,
			name: clamp(option.name || option.id, MAX_CHOICE_NAME),
			kind: mapOptionKind(option),
			currentValue: option.currentValue,
			options: flattenSelectChoices(option.options),
		});
	}
	if (
		!options.some((option) => option.kind === "mode") &&
		state.currentMode &&
		state.currentMode.availableModes.length > 0
	) {
		const currentMode = state.currentMode;
		options.push({
			id: "mode",
			name: "Mode",
			kind: "mode",
			currentValue: currentMode.currentModeId,
			options: currentMode.availableModes
				.slice(0, MAX_SETTING_OPTION_CHOICES)
				.map((mode) => ({
					value: mode.id,
					name: clamp(mode.name || mode.id, MAX_CHOICE_NAME),
					description: mode.description
						? clamp(mode.description, MAX_CHOICE_DESCRIPTION)
						: null,
				})),
		});
	}
	return options.slice(0, MAX_SETTING_OPTIONS);
}

function mapOptionKind(option: SessionConfigOption): SettingOption["kind"] {
	// Same category-first, id-fallback resolution the settings values and the
	// updateSession config-option lookup use, so the three never disagree on
	// which option backs which settings field.
	switch (option.category) {
		case "model":
			return "model";
		case "mode":
			return "mode";
		case "thought_level":
			return "effort";
		default:
			break;
	}
	switch (option.id) {
		case "model":
			return "model";
		case "mode":
			return "mode";
		case "effort":
			return "effort";
		default:
			return "other";
	}
}

function flattenSelectChoices(
	choices: SessionConfigSelectOptions,
): SettingOptionChoice[] {
	const flat = choices.flatMap((entry) =>
		"group" in entry ? entry.options.map(mapChoice) : [mapChoice(entry)],
	);
	return flat
		.filter(
			(choice) =>
				choice.value.length > 0 && choice.value.length <= MAX_CHOICE_VALUE,
		)
		.slice(0, MAX_SETTING_OPTION_CHOICES);
}

function mapChoice(choice: {
	value: string;
	name: string;
	description?: string | null;
}): SettingOptionChoice {
	return {
		value: choice.value,
		name: clamp(choice.name || choice.value, MAX_CHOICE_NAME),
		description: choice.description
			? clamp(choice.description, MAX_CHOICE_DESCRIPTION)
			: null,
	};
}

function clamp(text: string, limit: number): string {
	return text.length > limit ? text.slice(0, limit) : text;
}

function truncate(text: string): string {
	return text.length > SHORT_TEXT_LIMIT
		? text.slice(0, SHORT_TEXT_LIMIT)
		: text;
}

/**
 * One canonical event must stay far below the sync frame budget (1 MiB), or
 * a single giant tool payload would force-close every subscriber's socket on
 * delivery. Oversize values are dropped, not truncated: a prefix of a JSON
 * document is not JSON.
 */
const MAX_RAW_JSON_BYTES = 256 * 1024;

/**
 * Adapter raw input/output is arbitrary; the canonical log stores JSON.
 * Round-tripping through JSON strips functions/undefined/cycles — anything
 * unserializable or beyond the size budget becomes null.
 */
function toJsonValue(raw: unknown): JsonValue {
	if (raw === undefined) return null;
	try {
		const serialized = JSON.stringify(raw);
		if (serialized === undefined || serialized.length > MAX_RAW_JSON_BYTES) {
			return null;
		}
		return JSON.parse(serialized) ?? null;
	} catch {
		return null;
	}
}
