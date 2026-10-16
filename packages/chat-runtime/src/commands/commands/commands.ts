import { randomUUID } from "node:crypto";
import {
	deriveQueuedPrompts,
	emptySnapshot,
	outlineSnapshot,
	reduceMany,
	type SessionOutline,
	type SessionSnapshot,
	type StoredItem,
} from "@superset/chat/core";
import type {
	CancelTurnInput,
	ChatLaunchContext,
	CloseSessionInput,
	CloseStoppedAccountSessionInput,
	Cursor,
	GetItemsInput,
	GetSessionInput,
	PromptInput,
	QueuedPromptInput,
	RecoverAccountSessionInput,
	RespondToApprovalInput,
	ResumeQueueInput,
	SetConfigOptionInput,
	SetModeInput,
	StopBackgroundTaskInput,
} from "@superset/chat/protocol";
import {
	cancelTurnInputSchema,
	chatLaunchContextSchema,
	closeSessionInputSchema,
	closeStoppedAccountSessionInputSchema,
	createSessionInputSchema,
	forkSessionInputSchema,
	getItemBodiesInputSchema,
	getItemsInputSchema,
	getOutlineInputSchema,
	getSessionInputSchema,
	listSessionsInputSchema,
	promptInputSchema,
	queuedPromptInputSchema,
	recoverAccountSessionInputSchema,
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
import {
	findAccountCommand,
	findAccountSuccessor,
	readLaunchContext,
} from "../../projection/launchContext";
import type { ChatResetReason, PageResult } from "../../replay";
import { latestSeq, readPage, readSince } from "../../replay";
import type {
	LiveSessionRegistry,
	PromptResult,
	QueueState,
} from "../../sessions";

export const createSessionCommandSchema = createSessionInputSchema
	.omit({ workspaceId: true })
	.extend({
		scopeId: z.string().min(1),
		cwd: z.string().min(1),
		launchContext: chatLaunchContextSchema.optional(),
		predecessorSessionId: z.string().min(1).optional(),
		resume: z
			.object({
				harnessSessionId: z.string().min(1),
				requireExact: z.boolean().optional(),
			})
			.optional(),
	});
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
	terminalId?: string;
};

export type GetSessionResult = {
	accountBound?: true;
	account?: Pick<
		ChatLaunchContext["account"],
		"agent" | "selection" | "identity"
	> | null;
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
	accountBound?: true;
	live: boolean;
	terminalId: string | null;
};

export type ChatCommands = {
	createSession(input: CreateSessionCommandInput): CreateSessionResult;
	recoverAccountSession(
		input: RecoverAccountSessionInput,
	): Promise<CreateSessionResult & { terminalId: string }>;
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
	closeStoppedAccountSession(
		input: CloseStoppedAccountSessionInput,
	): Promise<void>;
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
	validateAccountLaunch?: (
		context: ChatLaunchContext,
		harness: string,
		scopeId: string,
	) => Promise<void>;
};

const MAX_CACHED_REPLAY_EVENTS = 20_000;

export function createCommands(options: CommandsOptions): ChatCommands {
	const mintSessionId = options.mintSessionId ?? randomUUID;
	const accountForks = new Map<
		string,
		{ input: string; promise: Promise<CreateSessionResult | null> }
	>();

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
				...(row.launchContextJson !== null
					? { accountBound: true as const }
					: {}),
				live: live !== null,
				terminalId: live?.terminalId ?? null,
			};
		});
	};

	return {
		createSession(input) {
			const parsed = createSessionCommandSchema.parse(input);
			if (parsed.launchContext) {
				if (
					parsed.cwd !== parsed.launchContext.cwd ||
					parsed.terminalId !== parsed.launchContext.terminalId
				)
					throw new Error(
						"The saved chat launch context does not match the conversation.",
					);
				const receipt = findAccountCommand(options.db, parsed.commandId);
				if (receipt) {
					if (
						receipt.scopeId !== parsed.scopeId ||
						receipt.harness !== parsed.harness ||
						receipt.launchContextJson !==
							JSON.stringify(parsed.launchContext) ||
						receipt.predecessorSessionId !==
							(parsed.predecessorSessionId ?? null)
					)
						throw new Error(
							"This command already belongs to a different account or conversation.",
						);
					return {
						sessionId: receipt.sessionId,
						epoch: receipt.epoch,
						terminalId: parsed.terminalId,
					};
				}
			} else {
				for (const row of options.sessions.list()) {
					if (row.launchContextJson === null) continue;
					if (
						parsed.resume &&
						row.harnessSessionId === parsed.resume.harnessSessionId
					)
						throw new Error(
							"This conversation has a saved account. Use account-aware recovery.",
						);
					if (parsed.terminalId) {
						let context: ChatLaunchContext | null = null;
						try {
							context = readLaunchContext(row);
						} catch {
							continue;
						}
						if (context?.terminalId === parsed.terminalId)
							throw new Error(
								"This pane has a saved account. Use account-aware recovery.",
							);
					}
				}
			}
			return options.dedupe.run(`createSession:${parsed.commandId}`, () => {
				if (!options.live.supports(parsed.harness)) {
					throw new Error(`unknown harness ${parsed.harness}`);
				}
				const sessionId = mintSessionId();
				const opened = options.journal.open({
					sessionId,
					scopeId: parsed.scopeId,
					harness: parsed.harness,
					...(parsed.launchContext
						? {
								launchContextJson: JSON.stringify(parsed.launchContext),
								createCommandId: parsed.commandId,
								predecessorSessionId: parsed.predecessorSessionId,
								harnessSessionId: parsed.resume?.harnessSessionId,
							}
						: {}),
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
						launchContext: parsed.launchContext,
					});
				} catch (error) {
					options.journal.discard(sessionId);
					throw error;
				}
				return {
					sessionId,
					epoch: opened.epoch,
					...(parsed.launchContext ? { terminalId: parsed.terminalId } : {}),
				};
			});
		},

		async recoverAccountSession(input) {
			const parsed = recoverAccountSessionInputSchema.parse(input);
			let source = options.sessions.get(parsed.sessionId);
			if (!source) throw new Error("The saved conversation was not found.");
			const visited = new Set<string>();
			for (;;) {
				if (visited.has(source.sessionId) || visited.size >= 100)
					throw new Error("The saved conversation recovery chain is invalid.");
				visited.add(source.sessionId);
				const next = findAccountSuccessor(options.db, source.sessionId);
				if (!next) break;
				if (
					next.scopeId !== source.scopeId ||
					next.harness !== source.harness ||
					next.launchContextJson !== source.launchContextJson
				)
					throw new Error("The saved conversation recovery account changed.");
				source = next;
			}
			const context = readLaunchContext(source);
			if (!context || !options.validateAccountLaunch)
				throw new Error(
					"This conversation does not have a recoverable saved account.",
				);
			const receipt = findAccountCommand(options.db, parsed.commandId);
			if (receipt && !visited.has(receipt.sessionId))
				throw new Error(
					"This command already belongs to another conversation.",
				);
			if (options.live.isClosing(source.sessionId))
				throw new Error(
					"The previous agent is still closing. Wait for it to stop before recovering.",
				);
			const registered = options.live.get(source.sessionId);
			if (registered?.state.status === "dead")
				throw new Error(
					"The stopped agent is still registered. Close the stopped agent before retrying recovery.",
				);
			if (registered || receipt)
				return {
					sessionId: source.sessionId,
					epoch: source.epoch,
					terminalId: context.terminalId,
				};
			// Reading the journal repairs the native-id projection after a host restart.
			options.journal.cursor(source.sessionId);
			source = options.sessions.get(source.sessionId) as ChatSessionRow;
			if (source.queuedCount > 0)
				throw new Error(
					"This conversation has unsent queued messages. Review and remove them before resuming.",
				);
			if (!source.harnessSessionId)
				throw new Error(
					"The saved conversation has no confirmed native session ID.",
				);
			const unchanged = JSON.stringify(source);
			await options.validateAccountLaunch(
				context,
				source.harness,
				source.scopeId,
			);
			if (
				JSON.stringify(options.sessions.get(source.sessionId)) !== unchanged ||
				findAccountSuccessor(options.db, source.sessionId) ||
				options.live.isClosing(source.sessionId) ||
				options.live.get(source.sessionId)
			)
				throw new Error(
					"The conversation changed or was already resumed. Refresh it before trying again.",
				);
			if (
				options.sessions
					.list()
					.some(
						(row) =>
							row.sessionId !== source.sessionId &&
							(options.live.get(row.sessionId) ||
								options.live.isClosing(row.sessionId)) &&
							row.launchContextJson !== null &&
							readLaunchContext(row)?.terminalId === context.terminalId,
					)
			)
				throw new Error("This pane already has a running conversation.");
			const created = this.createSession({
				commandId: parsed.commandId,
				scopeId: source.scopeId,
				harness: source.harness,
				cwd: context.cwd,
				terminalId: context.terminalId,
				launchContext: context,
				predecessorSessionId: source.sessionId,
				resume: {
					harnessSessionId: source.harnessSessionId,
					requireExact: true,
				},
			});
			return { ...created, terminalId: context.terminalId };
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
				const live = options.live.get(parsed.sessionId);
				if (live) {
					live.removeQueued(parsed.itemId);
					return;
				}
				const row = options.sessions.get(parsed.sessionId);
				if (row?.launchContextJson == null)
					throw new Error("The conversation is not live.");
				const replayed = replaySession(parsed.sessionId);
				if (!replayed.ok) throw new Error("The saved queue could not be read.");
				const stored = replayed.snapshot.items.get(parsed.itemId);
				const queued = deriveQueuedPrompts(replayed.snapshot).find(
					(item) => item.id === parsed.itemId,
				);
				if (!stored || !queued)
					throw new Error("The queued message was not found.");
				const item = { ...queued, discarded: true };
				delete item.queued;
				options.journal.append(parsed.sessionId, {
					type: "item",
					item,
					turnId: stored.turnId,
				});
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
			const original = options.sessions.get(parsed.sessionId);
			const context = original ? readLaunchContext(original) : null;
			if (context && original) {
				const pending = accountForks.get(parsed.commandId);
				if (pending) {
					if (pending.input !== JSON.stringify(parsed))
						throw new Error(
							"This command already belongs to another conversation.",
						);
					return pending.promise;
				}
			}
			const execute = async () => {
				if (context && original) {
					const receipt = findAccountCommand(options.db, parsed.commandId);
					if (receipt) {
						const prior = readLaunchContext(receipt);
						if (
							prior?.forkOfSessionId !== parsed.sessionId ||
							receipt.scopeId !== original.scopeId ||
							receipt.harness !== (parsed.harness ?? original.harness)
						)
							throw new Error(
								"This command already belongs to another conversation.",
							);
						return {
							sessionId: receipt.sessionId,
							epoch: receipt.epoch,
							terminalId: prior.terminalId,
						};
					}
					if (
						parsed.cwd !== context.cwd ||
						(parsed.harness && parsed.harness !== original?.harness) ||
						!options.validateAccountLaunch
					)
						throw new Error(
							"An account-bound branch must keep its original agent and working folder.",
						);
					await options.validateAccountLaunch(
						context,
						original.harness,
						original.scopeId,
					);
				}
				const live = options.live.require(parsed.sessionId);
				const forked = await live.fork();
				if (!forked) return null;
				const source = options.sessions.get(parsed.sessionId);
				if (!source) return null;
				if (context) {
					if (source.launchContextJson !== original?.launchContextJson)
						throw new Error("The original conversation account changed.");
					await options.validateAccountLaunch?.(
						context,
						source.harness,
						source.scopeId,
					);
				}
				return this.createSession({
					commandId: parsed.commandId,
					scopeId: source.scopeId,
					cwd: parsed.cwd,
					harness: parsed.harness ?? source.harness,
					resume: {
						harnessSessionId: forked,
						...(context ? { requireExact: true } : {}),
					},
					terminalId: live.terminalId,
					...(context
						? {
								launchContext: {
									...context,
									forkOfSessionId: source.sessionId,
								},
							}
						: {}),
				});
			};
			if (!context) return execute();
			const promise = execute();
			accountForks.set(parsed.commandId, {
				input: JSON.stringify(parsed),
				promise,
			});
			try {
				return await promise;
			} finally {
				accountForks.delete(parsed.commandId);
			}
		},

		async closeStoppedAccountSession(input) {
			const { sessionId } = closeStoppedAccountSessionInputSchema.parse(input);
			const row = options.sessions.get(sessionId);
			if (!row || !readLaunchContext(row))
				throw new Error(
					"This action requires a saved account-bound conversation.",
				);
			if (options.live.isClosing(sessionId))
				throw new Error(
					"This agent is still closing. Wait before trying again.",
				);
			const live = options.live.get(sessionId);
			if (!live || live.state.status !== "dead")
				throw new Error(
					"Only a failed registered account agent can be stopped here.",
				);
			const replayed = replaySession(sessionId);
			if (!replayed.ok)
				throw new Error(
					"The saved queue could not be read. Nothing was stopped.",
				);
			if (
				live.queueState.prompts.length > 0 ||
				deriveQueuedPrompts(replayed.snapshot).length > 0
			)
				throw new Error(
					"This conversation has unsent queued messages. Review and remove them before stopping the agent.",
				);
			// No await between queue validation and registry removal: a prompt cannot
			// enter the agent after the user confirmed this bounded stop action.
			replays.delete(sessionId);
			try {
				await options.live.dispose(sessionId);
			} finally {
				options.journal.announce(sessionId);
			}
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
			let account: GetSessionResult["account"] = null;
			try {
				const context = session ? readLaunchContext(session) : null;
				if (context) {
					const { agent, selection, identity } = context.account;
					account = { agent, selection, identity };
				}
			} catch {}
			return {
				...(session?.launchContextJson != null
					? { accountBound: true as const, account }
					: {}),
				live: options.live.get(parsed.sessionId) !== null,
				session,
				cursor: session && seq !== null ? { epoch: session.epoch, seq } : null,
			};
		},

		getQueue(input) {
			const parsed: GetSessionInput = getSessionInputSchema.parse(input);
			const session = options.live.get(parsed.sessionId);
			if (!session) {
				const row = options.sessions.get(parsed.sessionId);
				if (row?.launchContextJson == null)
					return { live: false, paused: false, prompts: [] };
				const replayed = replaySession(parsed.sessionId);
				if (!replayed.ok) throw new Error("The saved queue could not be read.");
				return {
					live: false,
					paused: true,
					prompts: deriveQueuedPrompts(replayed.snapshot).map((item) => ({
						itemId: item.id,
						clientId: item.clientId,
						content: item.content,
						queuedAtMs: item.startedAtMs,
					})),
				};
			}
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
