import { randomUUID } from "node:crypto";
import {
	type CanUseTool,
	query as createClaudeQuery,
	type EffortLevel,
	type ElicitationRequest,
	type ElicitationResult,
	type Options,
	type Query,
	getSessionMessages as readClaudeSessionMessages,
	type SDKControlInitializeResponse,
	type SDKMessage,
	type SDKUserMessage,
	type SessionMessage,
	type UserDialogRequest,
	type UserDialogResult,
} from "@anthropic-ai/claude-agent-sdk";
import {
	decodeMessagesCursor,
	EFFORT_LEVELS,
	encodeMessagesCursor,
	isSessionPermissionMode,
	isSessionPermissionUpdate,
	type MessagesPage,
	type PendingElicitationRequest,
	type PendingPermissionRequest,
	type PendingUserDialogRequest,
	type ResolvePendingResult,
	SESSION_PERMISSION_MODES,
	type SendMessageAccepted,
	type SessionCatalog,
	type SessionEventEnvelope,
	type SessionEventFrame,
	type SessionPermissionMode,
	type SessionPermissionResult,
	type SessionScopedState,
	type SessionsPage,
} from "@superset/session-protocol";
import { getTrustedUserShellBaseEnv } from "../../terminal/env";
import {
	buildClaudeCodeEnvironment,
	resolveClaudeCodeExecutable,
} from "./claude-runtime";
import { AsyncInputQueue } from "./input-queue";
import { SessionJournal } from "./journal";

export class SessionNotFoundError extends Error {}
export class SessionUnavailableError extends Error {}
export class SessionWorkspaceMismatchError extends Error {}
export class SessionCursorError extends Error {}

export type ClaudeQueryFactory = (input: {
	prompt: string | AsyncIterable<SDKUserMessage>;
	options?: Options;
}) => Query;

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	removeAbortListener?: () => void;
}

interface ManagedSession {
	state: SessionScopedState;
	readonly createInput: CreateClaudeSessionInput;
	readonly input: AsyncInputQueue<SDKUserMessage>;
	query: Query | null;
	readonly journal: SessionJournal;
	readonly subscribers: Set<(envelope: SessionEventEnvelope) => void>;
	readonly permissions: Map<string, Deferred<SessionPermissionResult | null>>;
	readonly userDialogs: Map<string, Deferred<UserDialogResult>>;
	readonly elicitations: Map<string, Deferred<ElicitationResult>>;
	catalog: SDKControlInitializeResponse | null;
	pump: Promise<void>;
	closing: boolean;
}

interface InflightCreation {
	workspaceId: string;
	promise: Promise<SessionScopedState>;
}

interface InflightRetry {
	promise: Promise<SessionScopedState>;
}

export interface ClaudeSessionManagerOptions {
	resolveWorkspaceCwd: (workspaceId: string) => string | Promise<string>;
	journalCapacity?: number;
	queryFactory?: ClaudeQueryFactory;
	getClaudeBaseEnvironment?: () => Record<string, string>;
	resolveClaudeExecutable?: (
		baseEnvironment: Readonly<Record<string, string>>,
	) => string;
	createNativeSessionId?: () => string;
	getSessionMessages?: (
		sessionId: string,
		options?: {
			dir?: string;
			includeSystemMessages?: boolean;
			limit?: number;
			offset?: number;
		},
	) => Promise<SessionMessage[]>;
}

export interface CreateClaudeSessionInput {
	sessionId: string;
	workspaceId: string;
	model?: string;
	permissionMode?: SessionPermissionMode;
	effort?: EffortLevel;
	title?: string;
}

/**
 * Owns one direct Claude Agent SDK Query per live Superset session.
 *
 * The Query and all SDK callbacks remain host-local. Remote clients receive
 * verbatim SDKMessage values plus Superset-owned state/interaction frames
 * through the sequence journal.
 */
export class ClaudeSessionManager {
	private readonly sessions = new Map<string, ManagedSession>();
	private readonly inflightCreations = new Map<string, InflightCreation>();
	private readonly inflightRetries = new Map<string, InflightRetry>();
	private readonly resolveWorkspaceCwd: ClaudeSessionManagerOptions["resolveWorkspaceCwd"];
	private readonly journalCapacity: number;
	private readonly queryFactory: ClaudeQueryFactory;
	private readonly getClaudeBaseEnvironment: NonNullable<
		ClaudeSessionManagerOptions["getClaudeBaseEnvironment"]
	>;
	private readonly resolveClaudeExecutable: NonNullable<
		ClaudeSessionManagerOptions["resolveClaudeExecutable"]
	>;
	private readonly createNativeSessionId: NonNullable<
		ClaudeSessionManagerOptions["createNativeSessionId"]
	>;
	private readonly getSessionMessagesImpl: NonNullable<
		ClaudeSessionManagerOptions["getSessionMessages"]
	>;

	constructor(options: ClaudeSessionManagerOptions) {
		this.resolveWorkspaceCwd = options.resolveWorkspaceCwd;
		this.journalCapacity = options.journalCapacity ?? 5_000;
		this.queryFactory = options.queryFactory ?? createClaudeQuery;
		this.getClaudeBaseEnvironment =
			options.getClaudeBaseEnvironment ?? getTrustedUserShellBaseEnv;
		this.resolveClaudeExecutable =
			options.resolveClaudeExecutable ?? resolveClaudeCodeExecutable;
		this.createNativeSessionId = options.createNativeSessionId ?? randomUUID;
		this.getSessionMessagesImpl =
			options.getSessionMessages ?? readClaudeSessionMessages;
	}

	async create(input: CreateClaudeSessionInput): Promise<SessionScopedState> {
		const existing = this.sessions.get(input.sessionId);
		if (existing) {
			this.assertWorkspace(existing, input.workspaceId);
			return this.cloneState(existing.state);
		}
		const inflight = this.inflightCreations.get(input.sessionId);
		if (inflight) {
			if (inflight.workspaceId !== input.workspaceId) {
				throw new SessionWorkspaceMismatchError(
					`Session ${input.sessionId} is already being created for workspace ${inflight.workspaceId}`,
				);
			}
			return inflight.promise;
		}

		const promise = this.createInternal(input);
		this.inflightCreations.set(input.sessionId, {
			workspaceId: input.workspaceId,
			promise,
		});
		try {
			return await promise;
		} finally {
			this.inflightCreations.delete(input.sessionId);
		}
	}

	/**
	 * Explicitly replaces an errored attempt with a fresh Claude Query and
	 * native transcript. Calling create again remains idempotent and can never
	 * cross this recovery boundary implicitly.
	 */
	async retry(input: { sessionId: string }): Promise<SessionScopedState> {
		const inflight = this.inflightRetries.get(input.sessionId);
		if (inflight) return inflight.promise;

		const failed = this.requireSession(input.sessionId);
		if (failed.state.status !== "errored" || failed.closing) {
			throw new SessionUnavailableError(
				`Session ${input.sessionId} cannot be retried while ${failed.state.status}`,
			);
		}

		const promise = this.retryInternal(failed);
		this.inflightRetries.set(input.sessionId, { promise });
		try {
			return await promise;
		} finally {
			if (this.inflightRetries.get(input.sessionId)?.promise === promise) {
				this.inflightRetries.delete(input.sessionId);
			}
		}
	}

	list(input: {
		workspaceId?: string;
		cursor?: string;
		limit: number;
	}): SessionsPage {
		const offset = decodeListCursor(input.cursor);
		if (offset === null) {
			throw new SessionCursorError("Invalid sessions cursor");
		}
		const states = [...this.sessions.values()]
			.filter(
				(runtime) =>
					runtime.state.status !== "errored" &&
					runtime.state.status !== "exited" &&
					(input.workspaceId === undefined ||
						runtime.state.workspaceId === input.workspaceId),
			)
			.sort((left, right) => right.state.createdAt - left.state.createdAt);
		const items = states
			.slice(offset, offset + input.limit)
			.map((runtime) => this.cloneState(runtime.state));
		const nextOffset = offset + items.length;
		return {
			items,
			nextCursor:
				nextOffset < states.length ? encodeListCursor(nextOffset) : null,
		};
	}

	get(input: { sessionId: string }): SessionScopedState {
		return this.cloneState(this.requireSession(input.sessionId).state);
	}

	async getMessages(input: {
		sessionId: string;
		cursor?: string;
		limit: number;
	}): Promise<MessagesPage> {
		const runtime = this.requireSession(input.sessionId);
		const transcript = await this.getSessionMessagesImpl(
			runtime.state.claudeSessionId ?? input.sessionId,
			{
				dir: runtime.state.cwd,
				includeSystemMessages: true,
			},
		);
		const end =
			input.cursor === undefined
				? transcript.length
				: decodeMessagesCursor(input.cursor);
		if (end === null || end > transcript.length) {
			throw new SessionCursorError("Invalid messages cursor");
		}
		const start = Math.max(0, end - input.limit);
		return {
			items: transcript.slice(start, end),
			nextCursor: start > 0 ? encodeMessagesCursor(start) : null,
		};
	}

	sendMessage(input: {
		sessionId: string;
		message: SDKUserMessage;
	}): SendMessageAccepted {
		const runtime = this.requireLive(input.sessionId);
		if (runtime.state.status !== "idle") {
			throw new SessionUnavailableError(
				`Session ${input.sessionId} cannot accept input while ${runtime.state.status}`,
			);
		}
		runtime.state.status = "running";
		this.emitState(runtime);
		runtime.input.push(input.message);
		return { accepted: true };
	}

	respondToPermission(input: {
		sessionId: string;
		requestId: string;
		response: SessionPermissionResult;
	}): ResolvePendingResult {
		const runtime = this.requireSession(input.sessionId);
		return this.settlePermission(runtime, input.requestId, input.response)
			? { status: "resolved" }
			: { status: "already_resolved" };
	}

	respondToUserDialog(input: {
		sessionId: string;
		requestId: string;
		response: UserDialogResult;
	}): ResolvePendingResult {
		const runtime = this.requireSession(input.sessionId);
		return this.settleUserDialog(runtime, input.requestId, input.response)
			? { status: "resolved" }
			: { status: "already_resolved" };
	}

	respondToElicitation(input: {
		sessionId: string;
		requestId: string;
		response: ElicitationResult;
	}): ResolvePendingResult {
		const runtime = this.requireSession(input.sessionId);
		return this.settleElicitation(runtime, input.requestId, input.response)
			? { status: "resolved" }
			: { status: "already_resolved" };
	}

	async interrupt(input: { sessionId: string }): Promise<void> {
		const runtime = this.requireLive(input.sessionId);
		for (const requestId of [...runtime.permissions.keys()]) {
			this.settlePermission(runtime, requestId, {
				behavior: "deny",
				message: "Interrupted by the user",
				interrupt: true,
			});
		}
		for (const requestId of [...runtime.userDialogs.keys()]) {
			this.settleUserDialog(runtime, requestId, { behavior: "cancelled" });
		}
		for (const requestId of [...runtime.elicitations.keys()]) {
			this.settleElicitation(runtime, requestId, { action: "cancel" });
		}
		await this.requireQuery(runtime).interrupt();
	}

	async setModel(input: { sessionId: string; model?: string }): Promise<void> {
		const runtime = this.requireLive(input.sessionId);
		await this.requireQuery(runtime).setModel(input.model);
		runtime.state.model = input.model ?? null;
		runtime.createInput.model = input.model;
		this.emitState(runtime);
	}

	async setPermissionMode(input: {
		sessionId: string;
		permissionMode: SessionPermissionMode;
	}): Promise<void> {
		const runtime = this.requireLive(input.sessionId);
		await this.requireQuery(runtime).setPermissionMode(input.permissionMode);
		runtime.state.permissionMode = input.permissionMode;
		runtime.createInput.permissionMode = input.permissionMode;
		this.emitState(runtime);
	}

	getCatalog(input: { sessionId: string }): SessionCatalog {
		const runtime = this.requireLive(input.sessionId);
		if (!runtime.catalog) {
			throw new SessionUnavailableError(
				`Session ${input.sessionId} has not initialized its catalog`,
			);
		}
		return {
			models: structuredClone(runtime.catalog.models),
			commands: structuredClone(runtime.catalog.commands),
			agents: structuredClone(runtime.catalog.agents),
			permissionModes: [...SESSION_PERMISSION_MODES],
		};
	}

	subscribe(input: {
		sessionId: string;
		since?: number;
		onEnvelope: (envelope: SessionEventEnvelope) => void;
	}): () => void {
		const runtime = this.requireSession(input.sessionId);
		if (input.since !== undefined) {
			const replay = runtime.journal.after(input.since);
			if (replay === null) {
				input.onEnvelope({
					seq: 0,
					sessionId: input.sessionId,
					ts: Date.now(),
					frame: {
						kind: "reset",
						reason: "cursor_unavailable",
						latestSeq: runtime.journal.latestSeq,
					},
				});
				return () => {};
			}
			for (const envelope of replay) input.onEnvelope(envelope);
		}
		runtime.subscribers.add(input.onEnvelope);
		return () => runtime.subscribers.delete(input.onEnvelope);
	}

	async dispose(): Promise<void> {
		const pumps: Promise<void>[] = [];
		for (const runtime of this.sessions.values()) {
			runtime.closing = true;
			runtime.state.status = "exited";
			this.cancelPending(runtime, "Host service stopped");
			this.emitState(runtime);
			runtime.input.close();
			runtime.query?.close();
			pumps.push(runtime.pump);
		}
		await Promise.allSettled(pumps);
	}

	private async createInternal(
		input: CreateClaudeSessionInput,
	): Promise<SessionScopedState> {
		const cwd = await this.resolveWorkspaceCwd(input.workspaceId);
		return this.startAttempt(input, cwd);
	}

	private retryInternal(failed: ManagedSession): Promise<SessionScopedState> {
		const input = structuredClone(failed.createInput);
		const cwd = failed.state.cwd;
		const createdAt = failed.state.createdAt;
		this.retireRuntime(failed, "Session restarted by the user");
		return this.startAttempt(input, cwd, { replacing: failed, createdAt });
	}

	private async startAttempt(
		input: CreateClaudeSessionInput,
		cwd: string,
		options: {
			replacing?: ManagedSession;
			createdAt?: number;
		} = {},
	): Promise<SessionScopedState> {
		const now = Date.now();
		const nativeSessionId = this.createNativeSessionId();
		const inputQueue = new AsyncInputQueue<SDKUserMessage>();
		const runtime: ManagedSession = {
			state: {
				sessionId: input.sessionId,
				claudeSessionId: nativeSessionId,
				workspaceId: input.workspaceId,
				harness: "claude",
				status: "starting",
				model: input.model ?? null,
				permissionMode: input.permissionMode ?? "default",
				effort: input.effort ?? null,
				pendingPermissions: [],
				pendingUserDialogs: [],
				pendingElicitations: [],
				cwd,
				lastSeq: 0,
				lastError: null,
				createdAt: options.createdAt ?? now,
				updatedAt: now,
			},
			createInput: structuredClone(input),
			input: inputQueue,
			query: null,
			journal: new SessionJournal(this.journalCapacity),
			subscribers: new Set(),
			permissions: new Map(),
			userDialogs: new Map(),
			elicitations: new Map(),
			catalog: null,
			pump: Promise.resolve(),
			closing: false,
		};

		// Install the tombstone before environment/executable/query setup so an
		// initialization failure remains inspectable for explicit retry while this
		// host-service process is alive. Sessions are intentionally not persisted.
		this.sessions.set(input.sessionId, runtime);
		if (options.replacing) {
			// Seed the new journal before redirecting old stream subscribers so a
			// reconnect has an authoritative epoch snapshot immediately.
			this.emitState(runtime);
			this.notifySessionRestarted(options.replacing, runtime);
		}

		const canUseTool: CanUseTool = (toolName, toolInput, options) => {
			if (!this.canAcceptSdkCallback(runtime)) {
				return Promise.resolve({
					behavior: "deny",
					message: "Session is no longer available",
					interrupt: true,
				});
			}
			return this.parkPermission(runtime, {
				requestId: options.requestId,
				toolUseID: options.toolUseID,
				toolName,
				input: toolInput,
				title: options.title,
				displayName: options.displayName,
				description: options.description,
				suggestions: options.suggestions?.filter(isSessionPermissionUpdate),
				blockedPath: options.blockedPath,
				decisionReason: options.decisionReason,
				agentID: options.agentID,
				signal: options.signal,
			});
		};

		try {
			const baseEnvironment = this.getClaudeBaseEnvironment();
			const claudeExecutable = this.resolveClaudeExecutable(baseEnvironment);
			const queryHandle = this.queryFactory({
				prompt: inputQueue,
				options: {
					cwd,
					env: buildClaudeCodeEnvironment(baseEnvironment),
					pathToClaudeCodeExecutable: claudeExecutable,
					sessionId: nativeSessionId,
					model: input.model,
					effort: input.effort,
					...(input.title ? { title: input.title } : {}),
					permissionMode: input.permissionMode ?? "default",
					includePartialMessages: true,
					persistSession: true,
					canUseTool,
					onUserDialog: (request, { signal }) => {
						if (!this.canAcceptSdkCallback(runtime)) {
							return Promise.resolve({ behavior: "cancelled" });
						}
						return this.parkUserDialog(runtime, request, signal);
					},
					onElicitation: (request, { signal }) => {
						if (!this.canAcceptSdkCallback(runtime)) {
							return Promise.resolve({ action: "cancel" });
						}
						return this.parkElicitation(runtime, request, signal);
					},
				},
			});
			runtime.query = queryHandle;
			runtime.pump = this.pump(runtime, queryHandle);
			runtime.catalog = await queryHandle.initializationResult();
			if (runtime.state.status === "starting") runtime.state.status = "idle";
			this.emitState(runtime);
			return this.cloneState(runtime.state);
		} catch (error) {
			this.markErrored(runtime, error);
			runtime.query?.close();
			throw error;
		}
	}

	private async pump(runtime: ManagedSession, query: Query): Promise<void> {
		try {
			for await (const message of query) {
				this.handleSdkMessage(runtime, message);
			}
			if (!runtime.closing) {
				this.markErrored(runtime, new Error("Claude SDK query ended"));
			}
		} catch (error) {
			if (!runtime.closing) this.markErrored(runtime, error);
		}
	}

	private handleSdkMessage(runtime: ManagedSession, message: SDKMessage): void {
		if (runtime.closing) return;
		this.journalFrame(runtime, { kind: "sdk", message });
		let stateChanged = false;
		if (message.type === "system" && message.subtype === "init") {
			runtime.state.claudeSessionId = message.session_id;
			runtime.state.model = message.model;
			runtime.createInput.model = message.model;
			if (isSessionPermissionMode(message.permissionMode)) {
				runtime.state.permissionMode = message.permissionMode;
				runtime.createInput.permissionMode = message.permissionMode;
			}
			stateChanged = true;
		} else if (
			message.type === "system" &&
			message.subtype === "session_state_changed"
		) {
			runtime.state.status = message.state;
			stateChanged = true;
		} else if (
			message.type === "system" &&
			message.subtype === "status" &&
			message.permissionMode &&
			isSessionPermissionMode(message.permissionMode)
		) {
			runtime.state.permissionMode = message.permissionMode;
			runtime.createInput.permissionMode = message.permissionMode;
			stateChanged = true;
		} else if (
			message.type === "result" &&
			runtime.state.status !== "errored" &&
			runtime.state.status !== "exited" &&
			runtime.permissions.size === 0 &&
			runtime.userDialogs.size === 0 &&
			runtime.elicitations.size === 0
		) {
			// The CLI does not consistently emit a trailing
			// session_state_changed(idle). A result is the authoritative end of a
			// turn once all callbacks are settled, so admission must reopen here.
			runtime.state.status = "idle";
			stateChanged = true;
		}
		if (stateChanged) this.emitState(runtime);
	}

	private parkPermission(
		runtime: ManagedSession,
		input: Omit<PendingPermissionRequest, "requestedAt"> & {
			signal: AbortSignal;
		},
	): Promise<SessionPermissionResult | null> {
		const existing = runtime.permissions.get(input.requestId);
		if (existing) return existing.promise;
		const request: PendingPermissionRequest = {
			requestId: input.requestId,
			toolUseID: input.toolUseID,
			toolName: input.toolName,
			input: input.input,
			title: input.title,
			displayName: input.displayName,
			description: input.description,
			suggestions: input.suggestions,
			blockedPath: input.blockedPath,
			decisionReason: input.decisionReason,
			agentID: input.agentID,
			requestedAt: Date.now(),
		};
		const deferred = createDeferred<SessionPermissionResult | null>();
		runtime.permissions.set(request.requestId, deferred);
		runtime.state.pendingPermissions.push(request);
		this.journalFrame(runtime, { kind: "permission_requested", request });
		this.enterRequiresAction(runtime);
		const abort = () => {
			this.settlePermission(runtime, request.requestId, {
				behavior: "deny",
				message: "Permission request was cancelled",
			});
		};
		input.signal.addEventListener("abort", abort, { once: true });
		deferred.removeAbortListener = () =>
			input.signal.removeEventListener("abort", abort);
		// Listen first, then check: settle is idempotent if abort fires between
		// these two operations, and an already-aborted signal cannot be missed.
		if (input.signal.aborted) abort();
		return deferred.promise;
	}

	private parkUserDialog(
		runtime: ManagedSession,
		request: UserDialogRequest,
		signal: AbortSignal,
	): Promise<UserDialogResult> {
		const requestId = randomUUID();
		const pending: PendingUserDialogRequest = {
			requestId,
			dialogKind: request.dialogKind,
			payload: request.payload,
			toolUseID: request.toolUseID,
			requestedAt: Date.now(),
		};
		const deferred = createDeferred<UserDialogResult>();
		runtime.userDialogs.set(requestId, deferred);
		runtime.state.pendingUserDialogs.push(pending);
		this.journalFrame(runtime, {
			kind: "user_dialog_requested",
			request: pending,
		});
		this.enterRequiresAction(runtime);
		const abort = () =>
			this.settleUserDialog(runtime, requestId, { behavior: "cancelled" });
		signal.addEventListener("abort", abort, { once: true });
		deferred.removeAbortListener = () =>
			signal.removeEventListener("abort", abort);
		if (signal.aborted) abort();
		return deferred.promise;
	}

	private parkElicitation(
		runtime: ManagedSession,
		request: ElicitationRequest,
		signal: AbortSignal,
	): Promise<ElicitationResult> {
		const requestId = request.elicitationId ?? randomUUID();
		const existing = runtime.elicitations.get(requestId);
		if (existing) return existing.promise;
		const pending: PendingElicitationRequest = {
			requestId,
			serverName: request.serverName,
			message: request.message,
			mode: request.mode,
			url: request.url,
			elicitationId: request.elicitationId,
			requestedSchema: request.requestedSchema,
			title: request.title,
			displayName: request.displayName,
			description: request.description,
			requestedAt: Date.now(),
		};
		const deferred = createDeferred<ElicitationResult>();
		runtime.elicitations.set(requestId, deferred);
		runtime.state.pendingElicitations.push(pending);
		this.journalFrame(runtime, {
			kind: "elicitation_requested",
			request: pending,
		});
		this.enterRequiresAction(runtime);
		const abort = () =>
			this.settleElicitation(runtime, requestId, { action: "cancel" });
		signal.addEventListener("abort", abort, { once: true });
		deferred.removeAbortListener = () =>
			signal.removeEventListener("abort", abort);
		if (signal.aborted) abort();
		return deferred.promise;
	}

	private settlePermission(
		runtime: ManagedSession,
		requestId: string,
		response: SessionPermissionResult,
	): boolean {
		const deferred = runtime.permissions.get(requestId);
		if (!deferred) return false;
		runtime.permissions.delete(requestId);
		deferred.removeAbortListener?.();
		runtime.state.pendingPermissions = runtime.state.pendingPermissions.filter(
			(request) => request.requestId !== requestId,
		);
		this.journalFrame(runtime, {
			kind: "permission_resolved",
			requestId,
			response,
		});
		this.leaveRequiresAction(runtime);
		deferred.resolve(response);
		return true;
	}

	private settleUserDialog(
		runtime: ManagedSession,
		requestId: string,
		response: UserDialogResult,
	): boolean {
		const deferred = runtime.userDialogs.get(requestId);
		if (!deferred) return false;
		runtime.userDialogs.delete(requestId);
		deferred.removeAbortListener?.();
		runtime.state.pendingUserDialogs = runtime.state.pendingUserDialogs.filter(
			(request) => request.requestId !== requestId,
		);
		this.journalFrame(runtime, {
			kind: "user_dialog_resolved",
			requestId,
			response,
		});
		this.leaveRequiresAction(runtime);
		deferred.resolve(response);
		return true;
	}

	private settleElicitation(
		runtime: ManagedSession,
		requestId: string,
		response: ElicitationResult,
	): boolean {
		const deferred = runtime.elicitations.get(requestId);
		if (!deferred) return false;
		runtime.elicitations.delete(requestId);
		deferred.removeAbortListener?.();
		runtime.state.pendingElicitations =
			runtime.state.pendingElicitations.filter(
				(request) => request.requestId !== requestId,
			);
		this.journalFrame(runtime, {
			kind: "elicitation_resolved",
			requestId,
			response,
		});
		this.leaveRequiresAction(runtime);
		deferred.resolve(response);
		return true;
	}

	private enterRequiresAction(runtime: ManagedSession): void {
		runtime.state.status = "requires_action";
		this.emitState(runtime);
	}

	private leaveRequiresAction(runtime: ManagedSession): void {
		if (
			runtime.permissions.size === 0 &&
			runtime.userDialogs.size === 0 &&
			runtime.elicitations.size === 0 &&
			runtime.state.status === "requires_action"
		) {
			runtime.state.status = "running";
		}
		this.emitState(runtime);
	}

	private cancelPending(runtime: ManagedSession, reason: string): void {
		for (const requestId of [...runtime.permissions.keys()]) {
			this.settlePermission(runtime, requestId, {
				behavior: "deny",
				message: reason,
				interrupt: true,
			});
		}
		for (const requestId of [...runtime.userDialogs.keys()]) {
			this.settleUserDialog(runtime, requestId, { behavior: "cancelled" });
		}
		for (const requestId of [...runtime.elicitations.keys()]) {
			this.settleElicitation(runtime, requestId, { action: "cancel" });
		}
	}

	private canAcceptSdkCallback(runtime: ManagedSession): boolean {
		return (
			!runtime.closing &&
			runtime.state.status !== "errored" &&
			runtime.state.status !== "exited"
		);
	}

	private retireRuntime(runtime: ManagedSession, reason: string): void {
		runtime.closing = true;
		this.cancelPending(runtime, reason);
		runtime.input.close();
		runtime.query?.close();
	}

	private notifySessionRestarted(
		previous: ManagedSession,
		replacement: ManagedSession,
	): void {
		const reset: SessionEventEnvelope = {
			seq: 0,
			sessionId: previous.state.sessionId,
			ts: Date.now(),
			frame: {
				kind: "reset",
				reason: "session_restarted",
				latestSeq: replacement.journal.latestSeq,
			},
		};
		for (const subscriber of [...previous.subscribers]) {
			try {
				subscriber(reset);
			} catch {
				// The subscriber is terminal either way; the replacement journal is
				// already installed for its next connection.
			}
		}
		previous.subscribers.clear();
	}

	private markErrored(runtime: ManagedSession, error: unknown): void {
		if (runtime.state.status === "errored") return;
		runtime.state.lastError =
			error instanceof Error ? error.message : String(error);
		runtime.state.status = "errored";
		this.cancelPending(runtime, runtime.state.lastError);
		this.emitState(runtime);
	}

	private journalFrame(
		runtime: ManagedSession,
		frame: SessionEventFrame,
	): SessionEventEnvelope {
		const envelope = runtime.journal.append(runtime.state.sessionId, frame);
		runtime.state.lastSeq = envelope.seq;
		for (const subscriber of [...runtime.subscribers]) {
			try {
				subscriber(envelope);
			} catch {
				// Stream delivery is best-effort and repaired through journal replay.
				// A broken client must never terminate the shared Claude Query pump or
				// prevent healthy subscribers from receiving this envelope.
				runtime.subscribers.delete(subscriber);
			}
		}
		return envelope;
	}

	private emitState(runtime: ManagedSession): void {
		runtime.state.updatedAt = Date.now();
		// The snapshot's lastSeq names its own envelope.
		runtime.state.lastSeq = runtime.journal.latestSeq + 1;
		this.journalFrame(runtime, {
			kind: "state",
			state: this.cloneState(runtime.state),
		});
	}

	private requireSession(sessionId: string): ManagedSession {
		const runtime = this.sessions.get(sessionId);
		if (!runtime) {
			throw new SessionNotFoundError(`Session not found: ${sessionId}`);
		}
		return runtime;
	}

	private requireLive(sessionId: string): ManagedSession {
		const runtime = this.requireSession(sessionId);
		if (
			runtime.state.status === "errored" ||
			runtime.state.status === "exited" ||
			runtime.closing
		) {
			throw new SessionUnavailableError(
				`Session ${sessionId} is ${runtime.state.status}`,
			);
		}
		return runtime;
	}

	private requireQuery(runtime: ManagedSession): Query {
		if (!runtime.query) {
			throw new SessionUnavailableError(
				`Session ${runtime.state.sessionId} has not started its Claude query`,
			);
		}
		return runtime.query;
	}

	private assertWorkspace(runtime: ManagedSession, workspaceId: string): void {
		if (runtime.state.workspaceId !== workspaceId) {
			throw new SessionWorkspaceMismatchError(
				`Session ${runtime.state.sessionId} belongs to workspace ${runtime.state.workspaceId}`,
			);
		}
	}

	private cloneState(state: SessionScopedState): SessionScopedState {
		return structuredClone(state);
	}
}

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((next) => {
		resolve = next;
	});
	return { promise, resolve };
}

const LIST_CURSOR_PATTERN = /^l1_([0-9a-z]+)$/;

function encodeListCursor(offset: number): string {
	return `l1_${offset.toString(36)}`;
}

function decodeListCursor(cursor: string | undefined): number | null {
	if (cursor === undefined) return 0;
	const match = LIST_CURSOR_PATTERN.exec(cursor);
	if (!match?.[1]) return null;
	const offset = Number.parseInt(match[1], 36);
	if (!Number.isSafeInteger(offset) || offset < 0) return null;
	return encodeListCursor(offset) === cursor ? offset : null;
}

// Compile-time guard that our public effort literals stay aligned with the SDK.
const _effortLevels: readonly EffortLevel[] = EFFORT_LEVELS;
void _effortLevels;
