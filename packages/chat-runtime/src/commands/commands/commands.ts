import { randomUUID } from "node:crypto";
import {
	deriveTimeline,
	emptySnapshot,
	outlineSnapshot,
	reduceMany,
	type SessionOutline,
	type SessionSnapshot,
	type StoredItem,
} from "@superset/chat/core";
import type {
	ApprovalRequest,
	CancelTurnInput,
	CloseSessionInput,
	Cursor,
	DurableEvent,
	GetItemsInput,
	GetSessionInput,
	PromptInput,
	QueuedPromptInput,
	RespondToApprovalInput,
	ResumeQueueInput,
	SetConfigOptionInput,
	SetModeInput,
	StopBackgroundTaskInput,
} from "@superset/chat/protocol";
import {
	cancelTurnInputSchema,
	closeSessionInputSchema,
	createSessionInputSchema,
	forkSessionInputSchema,
	getItemBodiesInputSchema,
	getItemsInputSchema,
	getOutlineInputSchema,
	getSessionInputSchema,
	listSessionsInputSchema,
	promptInputSchema,
	queuedPromptInputSchema,
	respondToApprovalInputSchema,
	resumeQueueInputSchema,
	rewindFilesInputSchema,
	rewindSessionInputSchema,
	setConfigOptionInputSchema,
	setModeInputSchema,
	stopBackgroundTaskInputSchema,
} from "@superset/chat/protocol";
import { z } from "zod";
import type { ChatCheckpoints, RewindFilesResult } from "../../checkpoints";
import type { ChatDb, ChatSessionRow } from "../../db";
import type { ChatJournal } from "../../journal";
import type { ChatSessionStore } from "../../projection";
import type { ChatResetReason, PageResult } from "../../replay";
import { latestSeq, readPage, readSince } from "../../replay";
import type {
	LiveSessionRegistry,
	PromptResult,
	QueueState,
} from "../../sessions";

export const createSessionCommandSchema = createSessionInputSchema
	.omit({ workspaceId: true })
	.extend({ scopeId: z.string().min(1), cwd: z.string().min(1) });
export type CreateSessionCommandInput = z.input<
	typeof createSessionCommandSchema
>;

export const forkSessionCommandSchema = forkSessionInputSchema.extend({
	cwd: z.string().min(1),
});
export type ForkSessionCommandInput = z.input<typeof forkSessionCommandSchema>;

export const rewindFilesCommandSchema = rewindFilesInputSchema.extend({
	cwd: z.string().min(1),
});
export type RewindFilesCommandInput = z.input<typeof rewindFilesCommandSchema>;

export const rewindSessionCommandSchema = rewindSessionInputSchema.extend({
	cwd: z.string().min(1),
});
export type RewindSessionCommandInput = z.input<
	typeof rewindSessionCommandSchema
>;

/** The finished turns and items shown before `itemId`, or null when it is not there. */
export function transcriptBefore(
	snapshot: SessionSnapshot,
	itemId: string,
): DurableEvent[] | null {
	const events: DurableEvent[] = [];
	for (const group of deriveTimeline(snapshot)) {
		const items = group.entries.flatMap((entry) =>
			entry.kind === "item" ? [entry.item] : entry.items,
		);
		const index = items.findIndex((item) => item.id === itemId);
		const kept = (index === -1 ? items : items.slice(0, index)).filter(
			(item) =>
				item.kind !== "approval_request" ||
				(item as ApprovalRequest).status !== "pending",
		);
		if (kept.length > 0) {
			if (group.turn) events.push({ type: "turn", turn: group.turn });
			for (const item of kept) {
				events.push({ type: "item", item, turnId: group.turnId });
			}
		}
		if (index !== -1) return events;
	}
	return null;
}

export const listSessionsCommandSchema = listSessionsInputSchema
	.omit({ workspaceId: true })
	.extend({ scopeId: z.string().min(1).optional() });
export type ListSessionsCommandInput = z.input<
	typeof listSessionsCommandSchema
>;

export type CreateSessionResult = {
	sessionId: string;
	epoch: string;
};

export type GetSessionResult = {
	session: ChatSessionRow | null;
	cursor: Cursor | null;
	/**
	 * Whether a harness process is still behind this session. The stored row
	 * outlives the process — after a host restart it still reads "idle" — so a
	 * caller that wants to prompt has to ask this, not the status.
	 */
	live: boolean;
};

export type GetQueueResult = QueueState & { live: boolean };

export type ChatSessionListEntry = ChatSessionRow & {
	live: boolean;
	terminalId: string | null;
};

export type ChatCommands = {
	createSession(input: CreateSessionCommandInput): CreateSessionResult;
	prompt(input: PromptInput): PromptResult;
	removeQueuedPrompt(input: QueuedPromptInput): void;
	steerQueuedPrompt(input: QueuedPromptInput): void;
	resumeQueue(input: ResumeQueueInput): void;
	cancelTurn(input: CancelTurnInput): void;
	stopBackgroundTask(input: StopBackgroundTaskInput): Promise<boolean>;
	respondToApproval(input: RespondToApprovalInput): void;
	setMode(input: SetModeInput): void;
	setConfigOption(input: SetConfigOptionInput): void;
	closeSession(input: CloseSessionInput): Promise<void>;
	closeScope(scopeId: string): Promise<void>;
	forkSession(
		input: ForkSessionCommandInput,
	): Promise<CreateSessionResult | null>;
	rewindFiles(input: RewindFilesCommandInput): Promise<RewindFilesResult>;
	rewindSession(input: RewindSessionCommandInput): Promise<CreateSessionResult>;
	getSession(input: GetSessionInput): GetSessionResult;
	getQueue(input: GetSessionInput): GetQueueResult;
	listSessions(input: ListSessionsCommandInput): ChatSessionListEntry[];
	getItems(input: z.input<typeof getItemsInputSchema>): PageResult;
	getOutline(input: z.input<typeof getOutlineInputSchema>): OutlineResult;
	getItemBodies(
		input: z.input<typeof getItemBodiesInputSchema>,
	): ItemBodiesResult;
};

export type OutlineResult =
	| { ok: true; outline: SessionOutline }
	| { ok: false; reset: ChatResetReason };

export type ItemBodiesResult =
	| { ok: true; items: StoredItem[] }
	| { ok: false; reset: ChatResetReason };

export type CommandsOptions = {
	journal: ChatJournal;
	db: ChatDb;
	sessions: ChatSessionStore;
	live: LiveSessionRegistry;
	checkpoints?: ChatCheckpoints;
	dedupe: { run<T>(commandId: string, execute: () => T): T };
	mintSessionId?: () => string;
};

const MAX_CACHED_REPLAY_EVENTS = 20_000;

export function createCommands(options: CommandsOptions): ChatCommands {
	const mintSessionId = options.mintSessionId ?? randomUUID;

	const replays = new Map<
		string,
		{ epoch: string; seq: number; snapshot: SessionSnapshot }
	>();
	const replaySession = (
		sessionId: string,
	):
		| { ok: true; snapshot: SessionSnapshot }
		| { ok: false; reset: ChatResetReason } => {
		const session = options.sessions.get(sessionId);
		if (!session) return { ok: false, reset: "session_not_found" };
		const seq = latestSeq(options.db, sessionId, session.epoch);
		const cached = replays.get(sessionId);
		const base =
			cached && cached.epoch === session.epoch && cached.seq <= seq
				? cached
				: null;
		if (base && base.seq === seq) {
			return { ok: true, snapshot: base.snapshot };
		}
		const replay = readSince(options.db, sessionId, {
			epoch: session.epoch,
			seq: base?.seq ?? 0,
		});
		if (!replay.ok) return replay;
		const snapshot = reduceMany(
			base?.snapshot ?? emptySnapshot(),
			replay.envelopes,
		);
		replays.delete(sessionId);
		replays.set(sessionId, {
			epoch: session.epoch,
			seq: replay.envelopes.at(-1)?.cursor.seq ?? base?.seq ?? 0,
			snapshot,
		});
		let cachedEvents = 0;
		for (const entry of replays.values()) cachedEvents += entry.seq;
		for (const [key, entry] of replays) {
			if (cachedEvents <= MAX_CACHED_REPLAY_EVENTS || key === sessionId) break;
			replays.delete(key);
			cachedEvents -= entry.seq;
		}
		if (cachedEvents > MAX_CACHED_REPLAY_EVENTS) replays.delete(sessionId);
		return { ok: true, snapshot };
	};

	const listSessions = (
		input: ListSessionsCommandInput,
	): ChatSessionListEntry[] => {
		const parsed = listSessionsCommandSchema.parse(input);
		const rows = parsed.scopeId
			? options.sessions.listByScope(parsed.scopeId)
			: options.sessions.list();
		return rows.slice(0, parsed.limit).map((row) => {
			const live = options.live.get(row.sessionId);
			return {
				...row,
				live: live !== null,
				terminalId: live?.terminalId ?? null,
			};
		});
	};

	return {
		createSession(input) {
			const parsed = createSessionCommandSchema.parse(input);
			return options.dedupe.run(`createSession:${parsed.commandId}`, () => {
				if (!options.live.supports(parsed.harness)) {
					throw new Error(`unknown harness ${parsed.harness}`);
				}
				const sessionId = mintSessionId();
				const opened = options.journal.open({
					sessionId,
					scopeId: parsed.scopeId,
					harness: parsed.harness,
				});
				try {
					options.live.create({
						sessionId,
						scopeId: parsed.scopeId,
						harness: parsed.harness,
						cwd: parsed.cwd,
						modeId: parsed.modeId,
						modelId: parsed.modelId,
						resume: parsed.resume,
						terminalId: parsed.terminalId,
					});
				} catch (error) {
					options.journal.discard(sessionId);
					throw error;
				}
				return { sessionId, epoch: opened.epoch };
			});
		},

		prompt(input) {
			const parsed: PromptInput = promptInputSchema.parse(input);
			return options.dedupe.run(`prompt:${parsed.commandId}`, () =>
				options.live
					.require(parsed.sessionId)
					.prompt(
						parsed.content,
						parsed.clientId,
						parsed.steer?.expectedTurnId,
					),
			);
		},

		removeQueuedPrompt(input) {
			const parsed: QueuedPromptInput = queuedPromptInputSchema.parse(input);
			options.dedupe.run(`removeQueuedPrompt:${parsed.commandId}`, () => {
				options.live.require(parsed.sessionId).removeQueued(parsed.itemId);
			});
		},

		steerQueuedPrompt(input) {
			const parsed: QueuedPromptInput = queuedPromptInputSchema.parse(input);
			options.dedupe.run(`steerQueuedPrompt:${parsed.commandId}`, () => {
				options.live.require(parsed.sessionId).steerQueued(parsed.itemId);
			});
		},

		resumeQueue(input) {
			const parsed: ResumeQueueInput = resumeQueueInputSchema.parse(input);
			options.dedupe.run(`resumeQueue:${parsed.commandId}`, () => {
				options.live.require(parsed.sessionId).resumeQueue();
			});
		},

		stopBackgroundTask(input) {
			const parsed: StopBackgroundTaskInput =
				stopBackgroundTaskInputSchema.parse(input);
			return options.dedupe.run(`stopBackgroundTask:${parsed.commandId}`, () =>
				options.live
					.require(parsed.sessionId)
					.stopBackgroundTask(parsed.taskId),
			);
		},

		cancelTurn(input) {
			const parsed: CancelTurnInput = cancelTurnInputSchema.parse(input);
			options.dedupe.run(`cancelTurn:${parsed.commandId}`, () => {
				options.live
					.require(parsed.sessionId)
					.cancelTurn(parsed.turnId, parsed.pauseQueue);
			});
		},

		respondToApproval(input) {
			const parsed: RespondToApprovalInput =
				respondToApprovalInputSchema.parse(input);
			options.dedupe.run(`respondToApproval:${parsed.commandId}`, () => {
				options.live
					.require(parsed.sessionId)
					.respondToApproval(parsed.approvalId, parsed.decision);
			});
		},

		setMode(input) {
			const parsed: SetModeInput = setModeInputSchema.parse(input);
			options.dedupe.run(`setMode:${parsed.commandId}`, () => {
				options.live.require(parsed.sessionId).setMode(parsed.modeId);
			});
		},

		setConfigOption(input) {
			const parsed: SetConfigOptionInput =
				setConfigOptionInputSchema.parse(input);
			options.dedupe.run(`setConfigOption:${parsed.commandId}`, () => {
				options.live
					.require(parsed.sessionId)
					.setConfigOption(parsed.configId, parsed.value);
			});
		},

		/**
		 * Branching is two steps: the agent copies its own session, and a new
		 * chat is opened onto the copy. Null when the harness cannot fork — the
		 * caller shows the conversation it already has rather than a dead one.
		 */
		async forkSession(input) {
			const parsed = forkSessionCommandSchema.parse(input);
			const live = options.live.require(parsed.sessionId);
			const forked = await live.fork();
			if (!forked) return null;
			const source = options.sessions.get(parsed.sessionId);
			if (!source) return null;
			return this.createSession({
				commandId: parsed.commandId,
				scopeId: source.scopeId,
				cwd: parsed.cwd,
				harness: parsed.harness ?? source.harness,
				resume: { harnessSessionId: forked },
				terminalId: live.terminalId,
			});
		},

		async rewindFiles(input) {
			const parsed = rewindFilesCommandSchema.parse(input);
			if (!options.checkpoints) return { files: "unsupported" };
			const files = await options.checkpoints.restore({
				cwd: parsed.cwd,
				sessionId: parsed.sessionId,
				itemId: parsed.itemId,
			});
			return { files };
		},

		/**
		 * A rewind continues in a new session: the transcript before the chosen
		 * message is copied in, so the chat reads the same, and the agent — which
		 * cannot be cut back — is told that conversation out of view.
		 */
		async rewindSession(input) {
			const parsed = rewindSessionCommandSchema.parse(input);
			const source = options.sessions.get(parsed.sessionId);
			const replay = replaySession(parsed.sessionId);
			if (!source || !replay.ok) {
				throw new Error(`chat session ${parsed.sessionId} is not running`);
			}
			const seed = transcriptBefore(replay.snapshot, parsed.itemId);
			if (!seed) {
				throw new Error(
					`message ${parsed.itemId} is not in chat session ${parsed.sessionId}`,
				);
			}
			const created = this.createSession({
				commandId: parsed.commandId,
				scopeId: source.scopeId,
				cwd: parsed.cwd,
				harness: source.harness,
				modeId: parsed.modeId,
				modelId: parsed.modelId,
				terminalId: options.live.get(parsed.sessionId)?.terminalId,
			});
			const live = options.live.require(created.sessionId);
			live.seed(seed);
			await options.checkpoints
				?.fork?.({
					cwd: parsed.cwd,
					fromSessionId: parsed.sessionId,
					toSessionId: created.sessionId,
				})
				.catch((error: unknown) =>
					console.warn(
						"[chat-runtime] could not carry checkpoints over",
						error,
					),
				);
			if (parsed.handoffPrompt) {
				live.prompt(
					[{ type: "text", text: parsed.handoffPrompt }],
					`rewind-${parsed.commandId}`,
					undefined,
					true,
				);
			}
			return created;
		},

		async closeSession(input) {
			const parsed: CloseSessionInput = closeSessionInputSchema.parse(input);
			const wasLive = options.live.get(parsed.sessionId) !== null;
			replays.delete(parsed.sessionId);
			try {
				await options.live.dispose(parsed.sessionId);
			} finally {
				if (wasLive) options.journal.announce(parsed.sessionId);
			}
		},

		async closeScope(scopeId) {
			const closed = await options.live.disposeScope(scopeId);
			for (const sessionId of closed) {
				replays.delete(sessionId);
				options.journal.announce(sessionId);
			}
		},

		getSession(input) {
			const parsed: GetSessionInput = getSessionInputSchema.parse(input);
			const seq = options.sessions.get(parsed.sessionId)
				? options.journal.cursor(parsed.sessionId).seq
				: null;
			// Reading the cursor can backfill the row, so read the row after it.
			const session = options.sessions.get(parsed.sessionId);
			return {
				live: options.live.get(parsed.sessionId) !== null,
				session,
				cursor: session && seq !== null ? { epoch: session.epoch, seq } : null,
			};
		},

		getQueue(input) {
			const parsed: GetSessionInput = getSessionInputSchema.parse(input);
			const session = options.live.get(parsed.sessionId);
			if (!session) return { live: false, paused: false, prompts: [] };
			return { live: true, ...session.queueState };
		},

		listSessions,

		getItems(input) {
			const parsed: GetItemsInput = getItemsInputSchema.parse(input);
			return readPage(options.db, parsed.sessionId, {
				before: parsed.before,
				limit: parsed.limit,
			});
		},

		getOutline(input) {
			const { sessionId } = getOutlineInputSchema.parse(input);
			const replayed = replaySession(sessionId);
			if (!replayed.ok) return replayed;
			return { ok: true, outline: outlineSnapshot(replayed.snapshot) };
		},

		getItemBodies(input) {
			const { sessionId, itemIds } = getItemBodiesInputSchema.parse(input);
			const replayed = replaySession(sessionId);
			if (!replayed.ok) return replayed;
			return {
				ok: true,
				items: itemIds.flatMap((id) => {
					const stored = replayed.snapshot.items.get(id);
					return stored ? [stored] : [];
				}),
			};
		},
	};
}
