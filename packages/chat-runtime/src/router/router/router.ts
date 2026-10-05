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
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { ChatRuntime } from "../../index";

const t = initTRPC.create();

export const createChatCallerFactory = t.createCallerFactory;

export type ChatRouterOptions = {
	resolveCwd(workspaceId: string): string | Promise<string>;
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
		createSession: t.procedure
			.input(createSessionInputSchema)
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
	});
}

export type ChatRouter = ReturnType<typeof createChatRouter>;

export type ChatRouterInputs = inferRouterInputs<ChatRouter>;
export type ChatRouterOutputs = inferRouterOutputs<ChatRouter>;
