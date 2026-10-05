import { randomUUID } from "node:crypto";
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
} from "@superset/chat/protocol";
import {
	cancelTurnInputSchema,
	closeSessionInputSchema,
	createSessionInputSchema,
	forkSessionInputSchema,
	getItemsInputSchema,
	getSessionInputSchema,
	listSessionsInputSchema,
	promptInputSchema,
	queuedPromptInputSchema,
	respondToApprovalInputSchema,
	resumeQueueInputSchema,
	setConfigOptionInputSchema,
	setModeInputSchema,
} from "@superset/chat/protocol";
import { z } from "zod";
import type { ChatDb, ChatSessionRow } from "../../db";
import type { ChatJournal } from "../../journal";
import type { ChatSessionStore } from "../../projection";
import type { PageResult } from "../../replay";
import { readPage } from "../../replay";
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

export type ChatCommands = {
	createSession(input: CreateSessionCommandInput): CreateSessionResult;
	prompt(input: PromptInput): PromptResult;
	removeQueuedPrompt(input: QueuedPromptInput): void;
	steerQueuedPrompt(input: QueuedPromptInput): void;
	resumeQueue(input: ResumeQueueInput): void;
	cancelTurn(input: CancelTurnInput): void;
	respondToApproval(input: RespondToApprovalInput): void;
	setMode(input: SetModeInput): void;
	setConfigOption(input: SetConfigOptionInput): void;
	closeSession(input: CloseSessionInput): Promise<void>;
	forkSession(
		input: ForkSessionCommandInput,
	): Promise<CreateSessionResult | null>;
	getSession(input: GetSessionInput): GetSessionResult;
	getQueue(input: GetSessionInput): GetQueueResult;
	listSessions(input: ListSessionsCommandInput): ChatSessionRow[];
	getItems(input: z.input<typeof getItemsInputSchema>): PageResult;
};

export type CommandsOptions = {
	journal: ChatJournal;
	db: ChatDb;
	sessions: ChatSessionStore;
	live: LiveSessionRegistry;
	dedupe: { run<T>(commandId: string, execute: () => T): T };
	mintSessionId?: () => string;
};

export function createCommands(options: CommandsOptions): ChatCommands {
	const mintSessionId = options.mintSessionId ?? randomUUID;

	const listSessions = (input: ListSessionsCommandInput): ChatSessionRow[] => {
		const parsed = listSessionsCommandSchema.parse(input);
		const rows = parsed.scopeId
			? options.sessions.listByScope(parsed.scopeId)
			: options.sessions.list();
		return rows.slice(0, parsed.limit);
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
					.prompt(parsed.content, parsed.clientId),
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
			const forked = await options.live.require(parsed.sessionId).fork();
			if (!forked) return null;
			const source = options.sessions.get(parsed.sessionId);
			if (!source) return null;
			return this.createSession({
				commandId: parsed.commandId,
				scopeId: source.scopeId,
				cwd: parsed.cwd,
				harness: parsed.harness ?? source.harness,
				resume: { harnessSessionId: forked },
			});
		},

		closeSession(input) {
			const parsed: CloseSessionInput = closeSessionInputSchema.parse(input);
			return options.live.dispose(parsed.sessionId);
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
	};
}
