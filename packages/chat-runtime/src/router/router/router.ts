import {
	type ChatAccountSelection,
	type ChatLaunchAccount,
	cancelTurnInputSchema,
	closeSessionInputSchema,
	closeStoppedAccountSessionInputSchema,
	createAccountSessionInputSchema,
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
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { ChatRuntime } from "../../index";
import {
	findAccountCommand,
	readLaunchContext,
} from "../../projection/launchContext";

const t = initTRPC.create();

export const createChatCallerFactory = t.createCallerFactory;

export type ChatRouterOptions = {
	resolveCwd(workspaceId: string): string | Promise<string>;
	accountHarnesses?: readonly string[];
	prepareAccount?(input: {
		harness: string;
		account: ChatAccountSelection;
		cwd: string;
		scopeId: string;
	}): Promise<ChatLaunchAccount>;
};

const UNKNOWN_HARNESS = /^unknown harness /;
const NOT_RUNNING = /^chat session (.+) is not running$/;
const NOT_QUEUED = /^prompt .+ is not queued$/;

function mapCommandError(runtime: ChatRuntime, error: unknown): unknown {
	if (error instanceof TRPCError) return error;
	if (!(error instanceof Error)) return error;
	if (UNKNOWN_HARNESS.test(error.message)) {
		return new TRPCError({
			code: "BAD_REQUEST",
			message: error.message,
			cause: error,
		});
	}
	if (NOT_QUEUED.test(error.message)) {
		return new TRPCError({
			code: "NOT_FOUND",
			message: error.message,
			cause: error,
		});
	}
	const sessionId = NOT_RUNNING.exec(error.message)?.[1];
	if (sessionId) {
		return new TRPCError({
			code: runtime.sessions.get(sessionId) ? "CONFLICT" : "NOT_FOUND",
			message: error.message,
			cause: error,
		});
	}
	return error;
}

export function createChatRouter(
	runtime: ChatRuntime,
	options: ChatRouterOptions,
) {
	function guarded<T>(execute: () => T): T {
		try {
			return execute();
		} catch (error) {
			throw mapCommandError(runtime, error);
		}
	}

	return t.router({
		accountSessionByCommand: t.procedure
			.input(z.strictObject({ commandId: z.uuid() }))
			.query(({ input }) => {
				const row = findAccountCommand(runtime.db, input.commandId);
				if (!row) return null;
				const context = readLaunchContext(row);
				if (!context)
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: "The saved chat account is unavailable.",
					});
				return {
					sessionId: row.sessionId,
					epoch: row.epoch,
					terminalId: context.terminalId,
				};
			}),
		accountCapabilities: t.procedure.query(() => ({
			version: 1 as const,
			harnesses: options.prepareAccount
				? [...(options.accountHarnesses ?? [])]
				: [],
		})),

		createAccountSession: t.procedure
			.input(createAccountSessionInputSchema)
			.mutation(async ({ input }) => {
				if (
					!options.prepareAccount ||
					!options.accountHarnesses?.includes(input.harness)
				)
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message:
							"This host does not support account selection for this chat agent.",
					});
				const receipt = findAccountCommand(runtime.db, input.commandId);
				if (receipt) {
					const context = readLaunchContext(receipt);
					if (
						!context ||
						context.forkOfSessionId !== undefined ||
						receipt.predecessorSessionId !== null ||
						receipt.scopeId !== input.workspaceId ||
						receipt.harness !== input.harness ||
						context.account.selection !== input.account.selection ||
						context.account.identity !== input.account.identity ||
						context.initialModeId !== input.modeId ||
						context.initialModelId !== input.modelId
					)
						throw new TRPCError({
							code: "CONFLICT",
							message:
								"This command already belongs to another conversation or account.",
						});
					return {
						sessionId: receipt.sessionId,
						epoch: receipt.epoch,
						terminalId: context.terminalId as string,
					};
				}
				const cwd = await options.resolveCwd(input.workspaceId);
				const account = await options.prepareAccount({
					harness: input.harness,
					account: input.account,
					cwd,
					scopeId: input.workspaceId,
				});
				if (
					account.selection !== input.account.selection ||
					account.identity !== input.account.identity
				)
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: "The selected chat account changed. Nothing was launched.",
					});
				const concurrent = findAccountCommand(runtime.db, input.commandId);
				if (concurrent) {
					const context = readLaunchContext(concurrent);
					if (
						!context ||
						context.forkOfSessionId !== undefined ||
						concurrent.predecessorSessionId !== null ||
						concurrent.scopeId !== input.workspaceId ||
						concurrent.harness !== input.harness ||
						context.account.selection !== input.account.selection ||
						context.account.identity !== input.account.identity ||
						context.initialModeId !== input.modeId ||
						context.initialModelId !== input.modelId
					)
						throw new TRPCError({
							code: "CONFLICT",
							message:
								"This command already belongs to another conversation or account.",
						});
					return {
						sessionId: concurrent.sessionId,
						epoch: concurrent.epoch,
						terminalId: context.terminalId,
					};
				}
				const terminalId = crypto.randomUUID();
				const created = guarded(() =>
					runtime.commands.createSession({
						commandId: input.commandId,
						scopeId: input.workspaceId,
						harness: input.harness,
						cwd,
						terminalId,
						modeId: input.modeId,
						modelId: input.modelId,
						launchContext: {
							v: 1,
							cwd,
							terminalId,
							account,
							initialModeId: input.modeId,
							initialModelId: input.modelId,
						},
					}),
				);
				return { ...created, terminalId };
			}),

		recoverAccountSession: t.procedure
			.input(recoverAccountSessionInputSchema)
			.mutation(({ input }) => runtime.commands.recoverAccountSession(input)),

		createSession: t.procedure
			.input(
				createSessionInputSchema.extend({
					account: z.never().optional(),
					launchContext: z.never().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const { workspaceId, ...rest } = input;
				const cwd = await options.resolveCwd(workspaceId);
				return guarded(() =>
					runtime.commands.createSession({
						...rest,
						scopeId: workspaceId,
						cwd,
					}),
				);
			}),

		prompt: t.procedure
			.input(promptInputSchema)
			.mutation(({ input }) => guarded(() => runtime.commands.prompt(input))),

		removeQueuedPrompt: t.procedure
			.input(queuedPromptInputSchema)
			.mutation(({ input }) =>
				guarded(() => runtime.commands.removeQueuedPrompt(input)),
			),

		steerQueuedPrompt: t.procedure
			.input(queuedPromptInputSchema)
			.mutation(({ input }) =>
				guarded(() => runtime.commands.steerQueuedPrompt(input)),
			),

		resumeQueue: t.procedure
			.input(resumeQueueInputSchema)
			.mutation(({ input }) =>
				guarded(() => runtime.commands.resumeQueue(input)),
			),

		cancelTurn: t.procedure
			.input(cancelTurnInputSchema)
			.mutation(({ input }) =>
				guarded(() => runtime.commands.cancelTurn(input)),
			),

		stopBackgroundTask: t.procedure
			.input(stopBackgroundTaskInputSchema)
			.mutation(({ input }) =>
				guarded(() => runtime.commands.stopBackgroundTask(input)),
			),

		respondToApproval: t.procedure
			.input(respondToApprovalInputSchema)
			.mutation(({ input }) =>
				guarded(() => runtime.commands.respondToApproval(input)),
			),

		setMode: t.procedure
			.input(setModeInputSchema)
			.mutation(({ input }) => guarded(() => runtime.commands.setMode(input))),

		setConfigOption: t.procedure
			.input(setConfigOptionInputSchema)
			.mutation(({ input }) =>
				guarded(() => runtime.commands.setConfigOption(input)),
			),

		forkSession: t.procedure
			.input(forkSessionInputSchema.extend({ workspaceId: z.string().min(1) }))
			.mutation(async ({ input }) => {
				const { workspaceId, ...rest } = input;
				const cwd = await options.resolveCwd(workspaceId);
				return guarded(() => runtime.commands.forkSession({ ...rest, cwd }));
			}),

		closeStoppedAccountSession: t.procedure
			.input(closeStoppedAccountSessionInputSchema)
			.mutation(({ input }) =>
				runtime.commands.closeStoppedAccountSession(input),
			),

		closeSession: t.procedure
			.input(closeSessionInputSchema)
			.mutation(({ input }) => runtime.commands.closeSession(input)),

		getSession: t.procedure
			.input(getSessionInputSchema)
			.query(({ input }) => runtime.commands.getSession(input)),

		getQueue: t.procedure
			.input(getSessionInputSchema)
			.query(({ input }) => runtime.commands.getQueue(input)),

		listSessions: t.procedure
			.input(listSessionsInputSchema)
			.query(({ input }) =>
				runtime.commands.listSessions({
					limit: input.limit,
					...(input.workspaceId === undefined
						? {}
						: { scopeId: input.workspaceId }),
				}),
			),

		getItems: t.procedure
			.input(getItemsInputSchema)
			.query(({ input }) => runtime.commands.getItems(input)),

		getOutline: t.procedure
			.input(getOutlineInputSchema)
			.query(({ input }) => runtime.commands.getOutline(input)),

		getItemBodies: t.procedure
			.input(getItemBodiesInputSchema)
			.query(({ input }) => runtime.commands.getItemBodies(input)),
	});
}

export type ChatRouter = ReturnType<typeof createChatRouter>;

export type ChatRouterInputs = inferRouterInputs<ChatRouter>;
export type ChatRouterOutputs = inferRouterOutputs<ChatRouter>;
