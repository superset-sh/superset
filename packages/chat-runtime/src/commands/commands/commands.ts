import { randomUUID } from "node:crypto";
import {
	emptySnapshot,
	outlineSnapshot,
	reduceMany,
	type SessionOutline,
	type SessionSnapshot,
	type StoredItem,
} from "@superset/chat/core";
import type {
	CancelTurnInput,
	CloseSessionInput,
	Cursor,
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
	setConfigOptionInputSchema,
	setModeInputSchema,
	stopBackgroundTaskInputSchema,
} from "@superset/chat/protocol";
import { z } from "zod";
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
			const session = options.sessions.get(parsed.sessionId);
			return {
				live: options.live.get(parsed.sessionId) !== null,
				session,
				cursor: session
					? {
							epoch: session.epoch,
							seq: options.journal.cursor(parsed.sessionId).seq,
						}
					: null,
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
