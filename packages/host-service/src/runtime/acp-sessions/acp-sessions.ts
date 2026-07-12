import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import {
	client,
	ndJsonStream,
	PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import type {
	ClientConnection,
	ContentBlock,
	CreateElicitationRequest,
	CreateElicitationResponse,
	JsonRpcId,
	MessagesPage,
	PendingPermission,
	PermissionOption,
	RequestPermissionOutcome,
	RequestPermissionRequest,
	RequestPermissionResponse,
	RespondToPermissionResult,
	SessionConfigOption,
	SessionModeState,
	SessionNotification,
	SessionScopedState,
	SessionStatus,
	SessionsPage,
	SessionUpdateEnvelope,
	SessionUpdateFrame,
	StopReason,
} from "@superset/session-protocol";
import {
	encodeMessagesCursor,
	selectedOptionIds,
} from "@superset/session-protocol";
import { SessionJournal } from "./journal";
import type { AcpSessionPersistence, AcpSessionRecord } from "./persistence";

export class AcpSessionNotFoundError extends Error {}
export class AcpSessionDeadError extends Error {}
export class AcpWorkspaceMismatchError extends Error {}

const CLIENT_INFO = { name: "superset-host", version: "1" };
const STDERR_TAIL_LIMIT = 8_192;
/**
 * Dead runtimes are kept around so get/getMessages can still serve their
 * journal, but only this many — beyond it the oldest are evicted outright.
 */
const MAX_DEAD_RUNTIMES = 20;
/** Frames served by getMessages pages — everything fold renders as timeline. */
const MESSAGE_FRAME_KINDS = new Set<SessionUpdateFrame["kind"]>([
	"update",
	"permission_requested",
	"permission_resolved",
	"prompt_rejected",
]);

function resolveAdapterEntry(): string {
	const moduleRequire = createRequire(import.meta.url);
	const adapterPkgJson = moduleRequire.resolve(
		"@agentclientprotocol/claude-agent-acp/package.json",
	);
	return path.join(path.dirname(adapterPkgJson), "dist/index.js");
}

/** The slice of the SDK's request handler context parkPermission needs. */
interface PermissionRequestContext {
	params: RequestPermissionRequest;
	requestId: JsonRpcId;
	signal: AbortSignal;
}

/** One AskUserQuestion-style question recovered from a form elicitation. */
interface ElicitationQuestion {
	/** The form field the chosen label is written back to (`question_<n>`). */
	fieldKey: string;
	/** The question text shown as the card title. */
	title: string;
	/** Clean option labels (each enum option's `const`). */
	labels: string[];
	/** Whether the field expects an array of labels. */
	multiSelect: boolean;
}

/**
 * Pull AskUserQuestion-style fields (`question_<n>` with enum options) out of
 * a form elicitation, in question order. The paired free-text
 * `question_<n>_custom` fields are ignored — mobile renders tappable options
 * only. Single-question forms carry the question text in `message`;
 * multi-question forms put each question's text in its field description.
 */
function extractElicitationQuestions(
	params: CreateElicitationRequest,
): ElicitationQuestion[] {
	const form = params as {
		message: string;
		requestedSchema?: { properties?: Record<string, unknown> };
	};
	const properties = form.requestedSchema?.properties ?? {};
	const questions: ElicitationQuestion[] = [];
	for (const [fieldKey, property] of Object.entries(properties)) {
		if (!/^question_\d+$/.test(fieldKey)) continue;
		const field = property as {
			type?: string;
			description?: string | null;
			oneOf?: Array<{ const?: unknown }>;
			items?: { anyOf?: Array<{ const?: unknown }> };
		};
		const multiSelect = field.type === "array";
		const enumOptions = (multiSelect ? field.items?.anyOf : field.oneOf) ?? [];
		const labels = enumOptions
			.map((option) => option.const)
			.filter((value): value is string => typeof value === "string");
		if (labels.length === 0) continue;
		questions.push({
			fieldKey,
			title: field.description ?? form.message,
			labels,
			multiSelect,
		});
	}
	return questions.sort(
		(a, b) =>
			Number(a.fieldKey.slice("question_".length)) -
			Number(b.fieldKey.slice("question_".length)),
	);
}

interface AcpSessionRuntime {
	/** Mutable session-scoped state; snapshots are cloned on the way out. */
	state: SessionScopedState;
	/** The adapter's ACP session id — host-internal, never leaves this file. */
	acpSessionId: string;
	child: ChildProcess;
	connection: ClientConnection;
	journal: SessionJournal;
	subscribers: Set<(envelope: SessionUpdateEnvelope) => void>;
	/** Parked session/request_permission responses, keyed by requestId. */
	pendingResolvers: Map<string, (outcome: RequestPermissionOutcome) => void>;
	/**
	 * Tool calls whose latest journaled status is non-terminal. Turn end and
	 * adapter death terminalize whatever is left here — without that, a
	 * cancelled or crashed turn leaves rows rendering as running forever.
	 */
	openToolCalls: Set<string>;
	activePromptCount: number;
	stderrTail: string;
	dead: boolean;
}

interface InflightCreation {
	workspaceId: string;
	promise: Promise<AcpSessionRuntime>;
}

export interface AcpSessionManagerOptions {
	/**
	 * Resolve a workspace id to the worktree directory its sessions run in.
	 * app.ts wires this to the workspaces table; tests pass a fixture dir.
	 */
	resolveWorkspaceCwd: (workspaceId: string) => string | Promise<string>;
	/** Per-session journal ring size (default 5,000; tests use small rings). */
	journalCapacity?: number;
	/**
	 * Absolute path of the adapter entry script the child process runs.
	 * Defaults to the real claude-agent-acp dist entry; tests inject a
	 * deterministic fake adapter speaking the same wire protocol.
	 */
	adapterEntry?: string;
	/**
	 * Durable session registry. When set, every session's binding row
	 * (workspace, adapter session id, title, stop reason) is upserted on each
	 * state emit, and rows found at construction are exposed as `offline`
	 * sessions that `ensureLive` resurrects via the adapter's `session/load`.
	 * Without it the manager is memory-only (sessions die with the host).
	 */
	persistence?: AcpSessionPersistence;
}

/**
 * Owns Claude Code sessions as ACP adapter child processes: one
 * `claude-agent-acp` process per session, spoken to over JSON-RPC/stdio via
 * the official SDK. Every session/update, permission request/resolution, and
 * state transition is journaled as a seq-numbered envelope (gapless, from 1)
 * and broadcast to subscribers — the WS stream and getMessages pagination
 * both read from that journal. Sessions are kept alive until the adapter
 * process dies or the manager is disposed; dead sessions keep their journal
 * (list/get/getMessages still serve them) until the graveyard evicts them.
 *
 * With `persistence`, session binding rows survive host restarts: a restarted
 * manager lists them as `offline` (get/list are passive) and `ensureLive` —
 * called by the router and stream route before every live-path operation —
 * resurrects one on demand via the adapter's `session/load`, which replays
 * the harness-stored transcript into a fresh journal. That new journal starts
 * seqs at 1; numeric cursors do not yet carry an incarnation id, so callers
 * must use the normal get + getMessages resync across a host restart.
 */
export class AcpSessionManager {
	private readonly resolveWorkspaceCwd: AcpSessionManagerOptions["resolveWorkspaceCwd"];
	private readonly journalCapacity: number;
	private readonly adapterEntry: string | undefined;
	private readonly persistence: AcpSessionPersistence | undefined;
	private readonly runtimes = new Map<string, AcpSessionRuntime>();
	private readonly creations = new Map<string, InflightCreation>();
	/**
	 * Sessions known from the persisted registry with no adapter process
	 * attached. Seeded once at construction; entries leave only by successful
	 * resurrection. Disjoint from `runtimes` by construction.
	 */
	private readonly offline = new Map<string, AcpSessionRecord>();

	constructor(options: AcpSessionManagerOptions) {
		this.resolveWorkspaceCwd = options.resolveWorkspaceCwd;
		const journalCapacity = options.journalCapacity ?? 5_000;
		if (!Number.isInteger(journalCapacity) || journalCapacity < 1) {
			throw new Error(
				`journal capacity must be a positive integer: ${journalCapacity}`,
			);
		}
		this.journalCapacity = journalCapacity;
		this.adapterEntry = options.adapterEntry;
		this.persistence = options.persistence;
		if (this.persistence) {
			try {
				for (const record of this.persistence.loadAll()) {
					this.offline.set(record.sessionId, record);
				}
			} catch (error) {
				console.warn(
					"[acp-sessions] failed to load persisted session registry",
					error,
				);
			}
		}
	}

	/**
	 * Idempotent create: returns the existing session's state when the id is
	 * already live (or dead) and bound to the same workspace.
	 */
	async create(input: {
		sessionId: string;
		workspaceId: string;
	}): Promise<SessionScopedState> {
		const runtime = await this.getOrCreateRuntime(
			input.sessionId,
			input.workspaceId,
		);
		return this.snapshotState(runtime);
	}

	get(sessionId: string): SessionScopedState {
		const runtime = this.runtimes.get(sessionId);
		if (runtime) return this.snapshotState(runtime);
		const record = this.offline.get(sessionId);
		if (record) return this.offlineState(record);
		throw new AcpSessionNotFoundError(`Unknown ACP session: ${sessionId}`);
	}

	/**
	 * Resurrect a persisted-but-offline session before a live-path call: spawn
	 * a fresh adapter and `session/load` the stored transcript back into a new
	 * journal. Live and dead runtimes pass through untouched — dead sessions
	 * stay dead within a host lifetime (read-only journal) and only become
	 * resurrectable after a restart turns them offline. Unknown ids are a
	 * no-op so the sync call that follows raises its usual NotFound. Failed
	 * loads leave the record offline and propagate the adapter's error.
	 */
	async ensureLive(sessionId: string): Promise<void> {
		if (this.runtimes.has(sessionId)) return;
		const record = this.offline.get(sessionId);
		if (!record) return;
		await this.resurrectRuntime(record);
	}

	/**
	 * Sessions newest first — dead ones included (a crashed session's
	 * transcript, and the error that killed it, must stay discoverable until
	 * the graveyard evicts it) and offline ones too (persisted rows from
	 * before a host restart, resurrectable on demand); clients read the
	 * status off the state. The cursor is `<createdAt>:<sessionId>` (the
	 * previous page's last row) — a sort position, not an id, so pagination
	 * resumes correctly even if that session was evicted between pages.
	 */
	list(input: {
		workspaceId?: string;
		cursor?: string;
		limit?: number;
	}): SessionsPage {
		const limit = input.limit ?? 50;
		const states = [
			...[...this.runtimes.values()].map((runtime) =>
				this.snapshotState(runtime),
			),
			...[...this.offline.values()]
				.filter((record) => !this.runtimes.has(record.sessionId))
				.map((record) => this.offlineState(record)),
		]
			.filter(
				(state) =>
					!input.workspaceId || state.workspaceId === input.workspaceId,
			)
			.sort(
				(a, b) =>
					b.createdAt - a.createdAt || a.sessionId.localeCompare(b.sessionId),
			);
		let start = 0;
		if (input.cursor) {
			const separator = input.cursor.indexOf(":");
			const createdAt = Number(input.cursor.slice(0, separator));
			const sessionId = input.cursor.slice(separator + 1);
			if (Number.isFinite(createdAt)) {
				// First session strictly after the cursor position in sort order.
				start = states.findIndex(
					(state) =>
						state.createdAt < createdAt ||
						(state.createdAt === createdAt &&
							state.sessionId.localeCompare(sessionId) > 0),
				);
				if (start === -1) start = states.length;
			}
		}
		const page = states.slice(start, start + limit);
		const last = page[page.length - 1];
		return {
			items: page,
			nextCursor:
				last && start + limit < states.length
					? `${last.createdAt}:${last.sessionId}`
					: null,
			// Reaching the manager at all means the feature gate is open — the
			// router answers `enabled: false` itself when the gate is closed.
			enabled: true,
		};
	}

	/** Journal page of timeline frames, walked backwards from `beforeSeq`. */
	getMessages(input: {
		sessionId: string;
		beforeSeq?: number;
		limit?: number;
	}): MessagesPage {
		const runtime = this.require(input.sessionId);
		const page = runtime.journal.page({
			beforeSeq: input.beforeSeq,
			limit: input.limit ?? 50,
			matches: (envelope) => MESSAGE_FRAME_KINDS.has(envelope.frame.kind),
		});
		return {
			items: page.items,
			nextCursor:
				page.nextBeforeSeq === null
					? null
					: encodeMessagesCursor(page.nextBeforeSeq),
		};
	}

	/**
	 * Starts a turn and acks admission. A turn can block on human permission
	 * decisions for minutes-to-hours — longer than any buffered relay HTTP
	 * request survives — so remote callers must never long-poll on turn end;
	 * completion (stop reason, errors) lands in journaled state frames. The
	 * returned `turn` promise is for in-process callers (tests) only.
	 */
	prompt(input: { sessionId: string; prompt: ContentBlock[] }): {
		accepted: true;
		turn: Promise<{ stopReason: StopReason }>;
	} {
		const runtime = this.requireLive(input.sessionId);
		// The adapter does not echo the prompt back as user_message_chunk
		// updates, so journal the user's message here — otherwise it is
		// invisible to every subscriber and to history replay. Journaled
		// synchronously before session/prompt so it always precedes the
		// agent's output in seq order.
		let promptStartSeq = 0;
		for (const block of input.prompt) {
			const envelope = this.journalFrame(runtime, {
				kind: "update",
				update: { sessionUpdate: "user_message_chunk", content: block },
			});
			if (promptStartSeq === 0) promptStartSeq = envelope.seq;
		}
		// A fresh turn starts with a clean error slate — anything in lastError
		// from here on is about THIS turn, so clients can show it verbatim.
		runtime.state.lastError = null;
		runtime.activePromptCount += 1;
		this.syncStatus(runtime, { force: true });
		const turn = runtime.connection.agent
			.request("session/prompt", {
				sessionId: runtime.acpSessionId,
				prompt: input.prompt,
			})
			.then((response) => {
				runtime.state.lastStopReason = response.stopReason;
				return { stopReason: response.stopReason };
			})
			.catch((error: unknown) => {
				const reason = error instanceof Error ? error.message : String(error);
				if (!runtime.dead) {
					runtime.state.lastError = reason;
				}
				// The user's message is already journaled and looks delivered —
				// this frame lets fold mark it failed on every client.
				this.journalFrame(runtime, {
					kind: "prompt_rejected",
					reason,
					promptStartSeq,
				});
				throw error;
			})
			.finally(() => {
				runtime.activePromptCount -= 1;
				// Whatever never reached a terminal status this turn (cancelled,
				// errored) must not keep rendering as running on every client.
				if (runtime.activePromptCount === 0) {
					this.terminalizeOpenToolCalls(runtime);
				}
				// Force an emit so every turn end lands a state frame with the
				// final lastStopReason / lastError even if the status is unchanged.
				this.syncStatus(runtime, { force: true });
			});
		// Detached callers (the router) drop `turn`; keep its rejection handled.
		turn.catch(() => {});
		return { accepted: true, turn };
	}

	/** First answer wins; later answers to the same request are reported stale. */
	respondToPermission(input: {
		sessionId: string;
		requestId: string;
		outcome: RequestPermissionOutcome;
	}): RespondToPermissionResult {
		// requireLive: a dead session should error loudly, not report the
		// (auto-cancelled) request as merely "already_resolved".
		const runtime = this.requireLive(input.sessionId);
		return this.settlePermission(runtime, input.requestId, input.outcome)
			? { status: "resolved" }
			: { status: "already_resolved" };
	}

	async cancel(input: { sessionId: string }): Promise<void> {
		const runtime = this.requireLive(input.sessionId);
		// ACP: a client cancelling the turn must answer outstanding permission
		// requests as cancelled — the adapter won't re-ask for them.
		for (const requestId of [...runtime.pendingResolvers.keys()]) {
			this.settlePermission(runtime, requestId, { outcome: "cancelled" });
		}
		await runtime.connection.agent.notify("session/cancel", {
			sessionId: runtime.acpSessionId,
		});
	}

	async setMode(input: { sessionId: string; modeId: string }): Promise<void> {
		const runtime = this.requireLive(input.sessionId);
		await runtime.connection.agent.request("session/set_mode", {
			sessionId: runtime.acpSessionId,
			modeId: input.modeId,
		});
		// The adapter acks set_mode with an empty response and only notifies
		// config_option_update (never current_mode_update) for client-initiated
		// switches, so currentMode is applied here from the request itself.
		if (runtime.state.currentMode) {
			runtime.state.currentMode = {
				...runtime.state.currentMode,
				currentModeId: input.modeId,
			};
			this.emitState(runtime);
		}
	}

	async setConfigOption(input: {
		sessionId: string;
		configId: string;
		value: string | boolean;
	}): Promise<void> {
		const runtime = this.requireLive(input.sessionId);
		const response = await runtime.connection.agent.request(
			"session/set_config_option",
			typeof input.value === "boolean"
				? {
						sessionId: runtime.acpSessionId,
						configId: input.configId,
						value: input.value,
						type: "boolean",
					}
				: {
						sessionId: runtime.acpSessionId,
						configId: input.configId,
						value: input.value,
					},
		);
		// The refreshed catalog rides the response — the adapter emits no
		// config_option_update notification for client-initiated changes.
		runtime.state.configOptions = response.configOptions;
		this.emitState(runtime);
	}

	/**
	 * Attach a live envelope listener. With `since`, the retained journal tail
	 * `(since, latest]` is replayed synchronously first; if part of that range
	 * was evicted a single `reset` frame is delivered instead and the caller
	 * must resync (get + getMessages) before subscribing again. Without
	 * `since`, the stream starts live from now. Returns the unsubscribe.
	 */
	subscribe(input: {
		sessionId: string;
		since?: number;
		onEnvelope: (envelope: SessionUpdateEnvelope) => void;
	}): () => void {
		const runtime = this.require(input.sessionId);
		const { onEnvelope } = input;
		const since = input.since ?? runtime.journal.latestSeq;
		const backlog = runtime.journal.after(since);
		if (backlog === null) {
			onEnvelope({
				// Reset frames short-circuit client seq checks; seq is nominal.
				seq: runtime.journal.latestSeq,
				sessionId: runtime.state.sessionId,
				ts: Date.now(),
				frame: { kind: "reset", reason: "journal_evicted" },
			});
			return () => {};
		}
		// Replay + attach happen in one synchronous block, so no envelope can
		// land in the gap between them.
		for (const envelope of backlog) {
			onEnvelope(envelope);
		}
		runtime.subscribers.add(onEnvelope);
		return () => {
			runtime.subscribers.delete(onEnvelope);
		};
	}

	/** Adapter process pid — lets tests and ops target the child directly. */
	adapterPid(sessionId: string): number | null {
		return this.require(sessionId).child.pid ?? null;
	}

	/** Kill every adapter process. Journals die with the manager. */
	async dispose(): Promise<void> {
		const inflight = [...this.creations.values()].map((creation) =>
			creation.promise.catch(() => null),
		);
		await Promise.all(inflight);
		for (const runtime of this.runtimes.values()) {
			try {
				runtime.connection.close();
			} catch {
				// best-effort — the stream may already be closed
			}
			try {
				runtime.child.kill();
			} catch {
				// best-effort — the process may already be gone
			}
		}
		this.runtimes.clear();
	}

	// -------------------------------------------------------------------------
	// Lifecycle internals
	// -------------------------------------------------------------------------

	private async getOrCreateRuntime(
		sessionId: string,
		workspaceId: string,
	): Promise<AcpSessionRuntime> {
		const existing = this.runtimes.get(sessionId);
		if (existing) {
			if (existing.state.workspaceId !== workspaceId) {
				throw new AcpWorkspaceMismatchError(
					`Session ${sessionId} is already bound to workspace ${existing.state.workspaceId}`,
				);
			}
			return existing;
		}

		const inflight = this.creations.get(sessionId);
		if (inflight) {
			if (inflight.workspaceId !== workspaceId) {
				throw new AcpWorkspaceMismatchError(
					`Session ${sessionId} is already being created for workspace ${inflight.workspaceId}`,
				);
			}
			return inflight.promise;
		}

		// A create() re-issued for a persisted session (the client's normal
		// open-session flow after a host restart) resurrects instead of minting
		// a fresh adapter session — same idempotency contract as the live case.
		const record = this.offline.get(sessionId);
		if (record) {
			if (record.workspaceId !== workspaceId) {
				throw new AcpWorkspaceMismatchError(
					`Session ${sessionId} is already bound to workspace ${record.workspaceId}`,
				);
			}
			return this.resurrectRuntime(record);
		}

		const promise = this.createRuntime(sessionId, workspaceId).finally(() => {
			this.creations.delete(sessionId);
		});
		this.creations.set(sessionId, { workspaceId, promise });
		return promise;
	}

	/** Spawn + session/load for an offline record; deduped via `creations`. */
	private resurrectRuntime(
		record: AcpSessionRecord,
	): Promise<AcpSessionRuntime> {
		const inflight = this.creations.get(record.sessionId);
		if (inflight) return inflight.promise;
		const promise = this.createRuntime(
			record.sessionId,
			record.workspaceId,
			record,
		)
			.then((runtime) => {
				this.offline.delete(record.sessionId);
				return runtime;
			})
			.finally(() => {
				this.creations.delete(record.sessionId);
			});
		this.creations.set(record.sessionId, {
			workspaceId: record.workspaceId,
			promise,
		});
		return promise;
	}

	private async createRuntime(
		sessionId: string,
		workspaceId: string,
		resume?: AcpSessionRecord,
	): Promise<AcpSessionRuntime> {
		const cwd = await this.resolveWorkspaceCwd(workspaceId);
		// process.execPath instead of a PATH lookup for "node": inside the
		// packaged Electron app there is no node on PATH — the Electron binary
		// itself runs the script when ELECTRON_RUN_AS_NODE is set (the same
		// pattern the desktop coordinator uses to spawn this host service).
		// Ambient Anthropic credentials (repo .env pulled in by a dev launcher,
		// shell profile) must never reach the agent child: they silently
		// override the user's own Claude login for the whole session. Scrubbed
		// here — the spawn site — so every launch path is covered, not just dev.
		const env: Record<string, string | undefined> = {
			...process.env,
			ELECTRON_RUN_AS_NODE: "1",
		};
		delete env.ANTHROPIC_API_KEY;
		delete env.ANTHROPIC_AUTH_TOKEN;
		const child = spawn(
			process.execPath,
			[this.adapterEntry ?? resolveAdapterEntry()],
			{
				cwd,
				env,
				stdio: ["pipe", "pipe", "pipe"],
			},
		);
		if (!child.stdin || !child.stdout) {
			child.kill();
			throw new Error("adapter child process is missing stdio pipes");
		}

		// Handlers are registered before session/new, so they close over a
		// mutable slot; updates that race construction are buffered and folded
		// once the runtime exists.
		let runtime: AcpSessionRuntime | null = null;
		// session/load can replay an arbitrarily long native transcript before its
		// response resolves. This fixed-size ring retains only the same recent
		// window the journal can serve, with O(1) eviction even for huge sessions.
		const earlyUpdates = new Array<SessionNotification | undefined>(
			this.journalCapacity,
		);
		let earlyUpdatesStart = 0;
		let earlyUpdatesSize = 0;
		const bufferEarlyUpdate = (notification: SessionNotification) => {
			if (earlyUpdatesSize < this.journalCapacity) {
				earlyUpdates[
					(earlyUpdatesStart + earlyUpdatesSize) % this.journalCapacity
				] = notification;
				earlyUpdatesSize += 1;
				return;
			}
			earlyUpdates[earlyUpdatesStart] = notification;
			earlyUpdatesStart = (earlyUpdatesStart + 1) % this.journalCapacity;
		};
		let stderrTail = "";
		child.stderr?.on("data", (chunk: Buffer) => {
			stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_LIMIT);
			if (runtime) runtime.stderrTail = stderrTail;
		});

		const app = client({ name: CLIENT_INFO.name })
			.onRequest(
				"session/request_permission",
				(
					context,
				): RequestPermissionResponse | Promise<RequestPermissionResponse> => {
					const target = runtime;
					if (!target || target.dead) {
						return { outcome: { outcome: "cancelled" } };
					}
					return this.parkPermission(target, context);
				},
			)
			.onRequest(
				"elicitation/create",
				(
					context,
				): CreateElicitationResponse | Promise<CreateElicitationResponse> => {
					const target = runtime;
					if (!target || target.dead) {
						return { action: "cancel" };
					}
					return this.parkElicitation(target, context);
				},
			)
			.onNotification("session/update", (context) => {
				if (!runtime) {
					bufferEarlyUpdate(context.params);
					return;
				}
				this.handleUpdate(runtime, context.params);
			});

		// `toWeb` returns differently-parameterized stream types depending on
		// which @types/node lib a consumer compiles under, so cast via unknown.
		const stream = ndJsonStream(
			Writable.toWeb(child.stdin) as unknown as WritableStream<Uint8Array>,
			Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>,
		);
		const connection = app.connect(stream);

		try {
			await connection.agent.request("initialize", {
				protocolVersion: PROTOCOL_VERSION,
				clientInfo: CLIENT_INFO,
				clientCapabilities: {
					fs: { readTextFile: false, writeTextFile: false },
					terminal: false,
					// UNSTABLE ACP extension, but it is what re-enables Claude
					// Code's built-in AskUserQuestion tool — the adapter disallows
					// the tool for clients that can't render form elicitations.
					elicitation: { form: {} },
				},
			});
			let acpSessionId: string;
			let modes: SessionModeState | null;
			let configOptions: SessionConfigOption[];
			if (resume) {
				// session/load replays the harness-stored transcript as ordinary
				// session/update notifications before the response resolves — they
				// buffer in earlyUpdates and land in the fresh journal from seq 1.
				const loaded = await connection.agent.request("session/load", {
					sessionId: resume.acpSessionId,
					cwd,
					mcpServers: [],
				});
				acpSessionId = resume.acpSessionId;
				modes = loaded.modes ?? null;
				configOptions = loaded.configOptions ?? [];
			} else {
				const session = await connection.agent.request("session/new", {
					cwd,
					mcpServers: [],
				});
				acpSessionId = session.sessionId;
				modes = session.modes ?? null;
				configOptions = session.configOptions ?? [];
			}

			// D14-c: the adapter starts (and loads) sessions in bypassPermissions;
			// a Superset session must never sit in bypass unless the user chose
			// it. Fresh sessions are forced to default outright; resumed ones only
			// override bypass, so a user-picked mode (plan, acceptEdits) survives
			// the restart.
			const hasDefaultMode = modes?.availableModes.some(
				(mode) => mode.id === "default",
			);
			const forceDefaultMode = resume
				? modes?.currentModeId === "bypassPermissions"
				: modes !== null && modes.currentModeId !== "default";
			if (modes && hasDefaultMode && forceDefaultMode) {
				await connection.agent.request("session/set_mode", {
					sessionId: acpSessionId,
					modeId: "default",
				});
				modes = { ...modes, currentModeId: "default" };
			}

			const now = Date.now();
			const created: AcpSessionRuntime = {
				state: {
					sessionId,
					workspaceId,
					harness: "claude-agent-acp",
					status: "idle",
					title: resume?.title ?? null,
					currentMode: modes,
					configOptions,
					pendingPermissions: [],
					cwd,
					lastSeq: 0,
					lastStopReason: resume?.lastStopReason ?? null,
					lastError: null,
					createdAt: resume?.createdAt ?? now,
					updatedAt: now,
				},
				acpSessionId,
				child,
				connection,
				journal: new SessionJournal(this.journalCapacity),
				subscribers: new Set(),
				pendingResolvers: new Map(),
				openToolCalls: new Set(),
				activePromptCount: 0,
				stderrTail,
				dead: false,
			};
			runtime = created;
			for (let index = 0; index < earlyUpdatesSize; index += 1) {
				const notification =
					earlyUpdates[(earlyUpdatesStart + index) % this.journalCapacity];
				if (notification) this.handleUpdate(created, notification);
			}
			if (resume) {
				// Nothing replayed can still be running — the process it ran in is
				// gone. Terminalize whatever the stored transcript left open so it
				// doesn't render as in-progress forever.
				this.terminalizeOpenToolCalls(created);
			}

			child.on("exit", (code, signal) => {
				this.markDead(
					created,
					`adapter exited (code=${code ?? "null"}, signal=${signal ?? "null"})`,
				);
			});
			connection.signal.addEventListener("abort", () => {
				this.markDead(created, "adapter connection closed");
			});
			// The process may have died between session/new resolving and the
			// listeners attaching — catch up on that state, else seed the journal.
			if (child.exitCode !== null || child.signalCode !== null) {
				this.markDead(
					created,
					`adapter exited (code=${child.exitCode ?? "null"}, signal=${child.signalCode ?? "null"})`,
				);
			} else if (connection.signal.aborted) {
				this.markDead(created, "adapter connection closed");
			} else {
				this.emitState(created);
			}

			this.runtimes.set(sessionId, created);
			return created;
		} catch (error) {
			try {
				connection.close();
			} catch {
				// best-effort — the stream may already be closed
			}
			child.kill();
			throw error;
		}
	}

	private markDead(runtime: AcpSessionRuntime, reason: string): void {
		if (runtime.dead) return;
		runtime.dead = true;
		for (const requestId of [...runtime.pendingResolvers.keys()]) {
			this.settlePermission(runtime, requestId, { outcome: "cancelled" });
		}
		this.terminalizeOpenToolCalls(runtime);
		const stderr = runtime.stderrTail.trim();
		runtime.state.lastError = stderr ? `${reason}\n${stderr}` : reason;
		this.syncStatus(runtime, { force: true });
		this.evictDeadRuntimes();
	}

	/**
	 * Journal a terminal status for every tool call still in flight. ACP has
	 * no cancelled status, so failed is the terminal we have; the journal is
	 * host-owned, so this is safe even after the adapter is gone.
	 */
	private terminalizeOpenToolCalls(runtime: AcpSessionRuntime): void {
		for (const toolCallId of runtime.openToolCalls) {
			this.journalFrame(runtime, {
				kind: "update",
				update: {
					sessionUpdate: "tool_call_update",
					toolCallId,
					status: "failed",
				},
			});
		}
		runtime.openToolCalls.clear();
	}

	/** Bound the dead-session graveyard; oldest (by updatedAt) go first. */
	private evictDeadRuntimes(): void {
		const dead = [...this.runtimes.values()].filter((runtime) => runtime.dead);
		if (dead.length <= MAX_DEAD_RUNTIMES) return;
		dead.sort((a, b) => a.state.updatedAt - b.state.updatedAt);
		for (const runtime of dead.slice(0, dead.length - MAX_DEAD_RUNTIMES)) {
			this.runtimes.delete(runtime.state.sessionId);
		}
	}

	// -------------------------------------------------------------------------
	// Update / permission plumbing
	// -------------------------------------------------------------------------

	private handleUpdate(
		runtime: AcpSessionRuntime,
		notification: SessionNotification,
	): void {
		if (notification.sessionId !== runtime.acpSessionId) return;
		const update = notification.update;
		this.journalFrame(runtime, { kind: "update", update });
		// Most variants are timeline-only; these few also live in scoped state.
		switch (update.sessionUpdate) {
			case "tool_call":
			case "tool_call_update": {
				const status =
					update.status ??
					(update.sessionUpdate === "tool_call" ? "pending" : null);
				if (status === "completed" || status === "failed") {
					runtime.openToolCalls.delete(update.toolCallId);
				} else if (status !== null) {
					runtime.openToolCalls.add(update.toolCallId);
				}
				break;
			}
			case "session_info_update":
				// Per ACP: absent = unchanged, explicit null = clear. Kept on
				// scoped state so the title survives journal eviction/resyncs.
				if (update.title !== undefined) {
					runtime.state.title = update.title;
					this.emitState(runtime);
				}
				break;
			case "current_mode_update":
				if (runtime.state.currentMode) {
					runtime.state.currentMode = {
						...runtime.state.currentMode,
						currentModeId: update.currentModeId,
					};
					this.emitState(runtime);
				}
				break;
			case "config_option_update":
				runtime.state.configOptions = update.configOptions;
				this.emitState(runtime);
				break;
			default:
				break;
		}
	}

	private parkPermission(
		runtime: AcpSessionRuntime,
		context: PermissionRequestContext,
	): Promise<RequestPermissionResponse> {
		const requestId =
			context.requestId !== null && context.requestId !== undefined
				? String(context.requestId)
				: randomUUID();
		const pending: PendingPermission = {
			requestId,
			toolCall: context.params.toolCall,
			options: context.params.options,
			requestedAt: Date.now(),
		};
		runtime.state.pendingPermissions = [
			...runtime.state.pendingPermissions,
			pending,
		];
		this.journalFrame(runtime, { kind: "permission_requested", pending });
		this.syncStatus(runtime, { force: true });
		return new Promise<RequestPermissionResponse>((resolve) => {
			runtime.pendingResolvers.set(requestId, (outcome) =>
				resolve({ outcome }),
			);
			// The adapter aborts the request when the turn ends unanswered
			// (session/cancel, turn error) — settle so nothing leaks. The signal
			// may already be aborted by the time we get here (listeners on an
			// aborted signal never fire), so check first.
			const settleCancelled = () =>
				this.settlePermission(runtime, requestId, { outcome: "cancelled" });
			if (context.signal.aborted) {
				settleCancelled();
				return;
			}
			context.signal.addEventListener("abort", settleCancelled);
		});
	}

	/**
	 * A form elicitation (the adapter's rendering of Claude Code's built-in
	 * AskUserQuestion tool) parked as one synthetic pending-permission card per
	 * question — the same journal/resolution plumbing and mobile UI as real
	 * permission asks. Questions are presented one at a time; each card's
	 * options are the question's enum labels plus a Skip, and the accepted
	 * response maps chosen labels back onto the form's `question_<n>` fields.
	 */
	private async parkElicitation(
		runtime: AcpSessionRuntime,
		context: {
			params: CreateElicitationRequest;
			signal: AbortSignal;
		},
	): Promise<CreateElicitationResponse> {
		const params = context.params;
		if (params.mode !== "form") {
			// Nothing mobile can render for url (or unknown) modes.
			return { action: "cancel" };
		}
		const questions = extractElicitationQuestions(params);
		if (questions.length === 0) {
			// An arbitrary form (e.g. from a user-configured MCP server) with no
			// recognizable question fields — decline rather than abort the tool.
			return { action: "decline" };
		}
		// Request-scoped elicitations (pre-session) carry no toolCallId.
		const adapterToolCallId =
			"toolCallId" in params ? (params.toolCallId ?? null) : null;
		const toolCallId = adapterToolCallId ?? `elicitation-${randomUUID()}`;
		// A synthetic card's tool row has no adapter behind it to ever send a
		// terminal status — journal one ourselves or it renders as running
		// forever. Adapter-owned tool calls get their updates from the adapter.
		const finish = (
			response: CreateElicitationResponse,
		): CreateElicitationResponse => {
			if (adapterToolCallId === null) {
				this.journalFrame(runtime, {
					kind: "update",
					update: {
						sessionUpdate: "tool_call_update",
						toolCallId,
						status: response.action === "accept" ? "completed" : "failed",
					},
				});
			}
			return response;
		};
		const content: Record<string, string | string[]> = {};
		for (const question of questions) {
			const outcome = await this.parkQuestionCard(runtime, {
				toolCallId,
				title: question.title,
				multiSelect: question.multiSelect,
				options: [
					...question.labels.map((label, index) => ({
						optionId: `option-${index}`,
						name: label,
						kind: "allow_once" as const,
					})),
					{ optionId: "skip", name: "Skip", kind: "reject_once" as const },
				],
				signal: context.signal,
			});
			if (outcome.outcome !== "selected") {
				// Turn cancelled / session died mid-question: abort the tool call.
				return finish({ action: "cancel" });
			}
			// Multi-select answers carry every picked option (state.ts's
			// selectedOptionIds reads the _meta extension); single-select carries
			// exactly one. Skip contributes nothing either way.
			const labels = selectedOptionIds(outcome)
				.filter((optionId) => optionId !== "skip")
				.map(
					(optionId) =>
						question.labels[Number(optionId.slice("option-".length))],
				)
				.filter((label): label is string => label !== undefined);
			const [firstLabel] = labels;
			if (firstLabel === undefined) continue;
			content[question.fieldKey] = question.multiSelect ? labels : firstLabel;
		}
		return finish({ action: "accept", content });
	}

	/** Park one synthetic question card and block until it is answered. */
	private parkQuestionCard(
		runtime: AcpSessionRuntime,
		input: {
			toolCallId: string;
			title: string;
			options: PermissionOption[];
			multiSelect?: boolean;
			signal: AbortSignal;
		},
	): Promise<RequestPermissionOutcome> {
		const requestId = randomUUID();
		const pending: PendingPermission = {
			requestId,
			toolCall: {
				toolCallId: input.toolCallId,
				// fold merges this over the adapter's tool_call frame, so the card
				// title becomes the question itself.
				title: input.title,
				kind: "other",
				status: "pending",
			},
			options: input.options,
			requestedAt: Date.now(),
			...(input.multiSelect ? { multiSelect: true } : {}),
		};
		runtime.state.pendingPermissions = [
			...runtime.state.pendingPermissions,
			pending,
		];
		this.journalFrame(runtime, { kind: "permission_requested", pending });
		this.syncStatus(runtime, { force: true });
		return new Promise<RequestPermissionOutcome>((resolve) => {
			runtime.pendingResolvers.set(requestId, resolve);
			// The adapter aborts the elicitation when the turn ends unanswered
			// (session/cancel, turn error) — settle so nothing leaks. The signal
			// may already be aborted (listeners on an aborted signal never fire),
			// so check first.
			const settleCancelled = () =>
				this.settlePermission(runtime, requestId, { outcome: "cancelled" });
			if (input.signal.aborted) {
				settleCancelled();
				return;
			}
			input.signal.addEventListener("abort", settleCancelled);
		});
	}

	/** Single resolution path for a parked permission; false when already settled. */
	private settlePermission(
		runtime: AcpSessionRuntime,
		requestId: string,
		outcome: RequestPermissionOutcome,
	): boolean {
		const resolver = runtime.pendingResolvers.get(requestId);
		if (!resolver) return false;
		runtime.pendingResolvers.delete(requestId);
		runtime.state.pendingPermissions = runtime.state.pendingPermissions.filter(
			(pending) => pending.requestId !== requestId,
		);
		this.journalFrame(runtime, {
			kind: "permission_resolved",
			requestId,
			outcome,
		});
		this.syncStatus(runtime, { force: true });
		resolver(outcome);
		return true;
	}

	// -------------------------------------------------------------------------
	// State snapshots + journal fanout
	// -------------------------------------------------------------------------

	private journalFrame(
		runtime: AcpSessionRuntime,
		frame: SessionUpdateFrame,
	): SessionUpdateEnvelope {
		const envelope = runtime.journal.append(runtime.state.sessionId, frame);
		for (const subscriber of runtime.subscribers) {
			try {
				subscriber(envelope);
			} catch (error) {
				console.warn("[acp-sessions] subscriber threw on envelope", error);
			}
		}
		return envelope;
	}

	private computeStatus(runtime: AcpSessionRuntime): SessionStatus {
		if (runtime.dead) return "dead";
		if (runtime.state.pendingPermissions.length > 0) {
			return "awaiting_permission";
		}
		if (runtime.activePromptCount > 0) return "running";
		return "idle";
	}

	private syncStatus(
		runtime: AcpSessionRuntime,
		options?: { force?: boolean },
	): void {
		const next = this.computeStatus(runtime);
		if (next === runtime.state.status && !options?.force) return;
		runtime.state.status = next;
		this.emitState(runtime);
	}

	private emitState(runtime: AcpSessionRuntime): void {
		runtime.state.updatedAt = Date.now();
		this.journalFrame(runtime, {
			kind: "state",
			// The snapshot rides in the next envelope — lastSeq is that seq.
			state: {
				...this.snapshotState(runtime),
				lastSeq: runtime.journal.latestSeq + 1,
			},
		});
		// Every state emit refreshes the registry row (create, title change,
		// turn end, death) — best-effort; the live path never depends on it.
		this.persistState(runtime);
	}

	private persistState(runtime: AcpSessionRuntime): void {
		if (!this.persistence) return;
		try {
			this.persistence.upsert({
				sessionId: runtime.state.sessionId,
				workspaceId: runtime.state.workspaceId,
				acpSessionId: runtime.acpSessionId,
				harness: runtime.state.harness,
				cwd: runtime.state.cwd,
				title: runtime.state.title,
				lastStopReason: runtime.state.lastStopReason,
				createdAt: runtime.state.createdAt,
				updatedAt: runtime.state.updatedAt,
			});
		} catch (error) {
			console.warn("[acp-sessions] failed to persist session row", error);
		}
	}

	/** Synthesized snapshot for a persisted session with no adapter attached. */
	private offlineState(record: AcpSessionRecord): SessionScopedState {
		return {
			sessionId: record.sessionId,
			workspaceId: record.workspaceId,
			harness: record.harness,
			status: "offline",
			title: record.title,
			currentMode: null,
			configOptions: [],
			pendingPermissions: [],
			cwd: record.cwd,
			lastSeq: 0,
			lastStopReason: record.lastStopReason,
			lastError: null,
			createdAt: record.createdAt,
			updatedAt: record.updatedAt,
		};
	}

	private snapshotState(runtime: AcpSessionRuntime): SessionScopedState {
		return {
			...runtime.state,
			currentMode: runtime.state.currentMode
				? { ...runtime.state.currentMode }
				: null,
			configOptions: [...runtime.state.configOptions],
			pendingPermissions: runtime.state.pendingPermissions.map((pending) => ({
				...pending,
			})),
			lastSeq: runtime.journal.latestSeq,
		};
	}

	private require(sessionId: string): AcpSessionRuntime {
		const runtime = this.runtimes.get(sessionId);
		if (!runtime) {
			throw new AcpSessionNotFoundError(`Unknown ACP session: ${sessionId}`);
		}
		return runtime;
	}

	private requireLive(sessionId: string): AcpSessionRuntime {
		const runtime = this.require(sessionId);
		if (runtime.dead) {
			throw new AcpSessionDeadError(
				`ACP session ${sessionId} is dead${
					runtime.state.lastError ? `: ${runtime.state.lastError}` : ""
				}`,
			);
		}
		return runtime;
	}
}
