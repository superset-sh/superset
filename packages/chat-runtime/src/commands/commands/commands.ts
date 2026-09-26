import { randomUUID } from "node:crypto";
import type {
	AddPinInput,
	CancelTurnInput,
	Cursor,
	GetItemsInput,
	GetSessionInput,
	ListPinsInput,
	PromptInput,
	RemovePinInput,
	RenamePinInput,
	RespondToApprovalInput,
	SetModeInput,
} from "@superset/chat/protocol";
import {
	addPinInputSchema,
	cancelTurnInputSchema,
	createSessionInputSchema,
	getItemsInputSchema,
	getSessionInputSchema,
	listPinsInputSchema,
	listSessionsInputSchema,
	promptInputSchema,
	removePinInputSchema,
	renamePinInputSchema,
	respondToApprovalInputSchema,
	setModeInputSchema,
} from "@superset/chat/protocol";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { ChatDb, ChatPinRow, ChatSessionRow } from "../../db";
import { chatPins } from "../../db";
import type { ChatJournal } from "../../journal";
import type { ChatSessionStore } from "../../projection";
import type { PageResult } from "../../replay";
import { readPage } from "../../replay";
import type { LiveSessionRegistry, PromptResult } from "../../sessions";

export const createSessionCommandSchema = createSessionInputSchema
	.omit({ workspaceId: true })
	.extend({ scopeId: z.string().min(1), cwd: z.string().min(1) });
export type CreateSessionCommandInput = z.input<
	typeof createSessionCommandSchema
>;

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
};

export type ChatCommands = {
	createSession(input: CreateSessionCommandInput): CreateSessionResult;
	prompt(input: PromptInput): PromptResult;
	cancelTurn(input: CancelTurnInput): void;
	respondToApproval(input: RespondToApprovalInput): void;
	setMode(input: SetModeInput): void;
	getSession(input: GetSessionInput): GetSessionResult;
	listSessions(input: ListSessionsCommandInput): ChatSessionRow[];
	getItems(input: z.input<typeof getItemsInputSchema>): PageResult;
	addPin(input: AddPinInput): ChatPinRow;
	removePin(input: RemovePinInput): void;
	renamePin(input: RenamePinInput): ChatPinRow | null;
	listPins(input: ListPinsInput): ChatPinRow[];
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

		cancelTurn(input) {
			const parsed: CancelTurnInput = cancelTurnInputSchema.parse(input);
			options.dedupe.run(`cancelTurn:${parsed.commandId}`, () => {
				options.live.require(parsed.sessionId).cancelTurn(parsed.turnId);
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

		getSession(input) {
			const parsed: GetSessionInput = getSessionInputSchema.parse(input);
			const session = options.sessions.get(parsed.sessionId);
			return {
				session,
				cursor: session
					? {
							epoch: session.epoch,
							seq: options.journal.cursor(parsed.sessionId).seq,
						}
					: null,
			};
		},

		listSessions,

		getItems(input) {
			const parsed: GetItemsInput = getItemsInputSchema.parse(input);
			return readPage(options.db, parsed.sessionId, {
				before: parsed.before,
				limit: parsed.limit,
			});
		},

		addPin(input) {
			const parsed: AddPinInput = addPinInputSchema.parse(input);
			return options.dedupe.run(`addPin:${parsed.commandId}`, () => {
				options.db
					.insert(chatPins)
					.values({
						sessionId: parsed.sessionId,
						itemId: parsed.itemId,
						label: parsed.label,
						snapshotText: parsed.snapshotText,
						createdAt: Date.now(),
					})
					.onConflictDoUpdate({
						target: [chatPins.sessionId, chatPins.itemId],
						set: {
							label: parsed.label,
							snapshotText: parsed.snapshotText,
						},
					})
					.run();
				const row = options.db
					.select()
					.from(chatPins)
					.where(
						and(
							eq(chatPins.sessionId, parsed.sessionId),
							eq(chatPins.itemId, parsed.itemId),
						),
					)
					.get();
				if (!row) throw new Error("pin not found after insert");
				return row;
			});
		},

		removePin(input) {
			const parsed: RemovePinInput = removePinInputSchema.parse(input);
			options.dedupe.run(`removePin:${parsed.commandId}`, () => {
				options.db
					.delete(chatPins)
					.where(
						and(
							eq(chatPins.sessionId, parsed.sessionId),
							eq(chatPins.itemId, parsed.itemId),
						),
					)
					.run();
			});
		},

		renamePin(input) {
			const parsed: RenamePinInput = renamePinInputSchema.parse(input);
			return options.dedupe.run(`renamePin:${parsed.commandId}`, () => {
				options.db
					.update(chatPins)
					.set({ label: parsed.label })
					.where(
						and(
							eq(chatPins.sessionId, parsed.sessionId),
							eq(chatPins.itemId, parsed.itemId),
						),
					)
					.run();
				return (
					options.db
						.select()
						.from(chatPins)
						.where(
							and(
								eq(chatPins.sessionId, parsed.sessionId),
								eq(chatPins.itemId, parsed.itemId),
							),
						)
						.get() ?? null
				);
			});
		},

		listPins(input) {
			const parsed: ListPinsInput = listPinsInputSchema.parse(input);
			return options.db
				.select()
				.from(chatPins)
				.where(eq(chatPins.sessionId, parsed.sessionId))
				.orderBy(asc(chatPins.createdAt))
				.all();
		},
	};
}
