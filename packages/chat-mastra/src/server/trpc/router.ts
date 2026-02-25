import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import {
	approvalRespond as approvalRespondRuntime,
	configureRuntimeState,
	control as controlRuntime,
	createSession as createSessionRuntime,
	deleteSession as deleteSessionRuntime,
	ensureRuntime as ensureRuntimeState,
	getDisplayState as getDisplayStateRuntime,
	hasRuntime as hasRuntimeState,
	listSessions as listSessionsRuntime,
	planRespond as planRespondRuntime,
	questionRespond as questionRespondRuntime,
	type RuntimeConfig,
	sendMessage as sendMessageRuntime,
	startRuntimeService,
	stopRuntimeService,
} from "./runtime/runtime-state";
import { searchFiles } from "./utils/file-search";
import {
	approvalRespondInput,
	controlInput,
	createSessionInput,
	ensureRuntimeInput,
	planRespondInput,
	questionRespondInput,
	searchFilesInput,
	sendMessageInput,
	sessionIdInput,
	startInput,
	workspaceIdInput,
} from "./zod";

const t = initTRPC.create({ transformer: superjson });

export type CreateChatMastraServiceRouterOptions = RuntimeConfig;

export function createChatMastraServiceRouter(
	options: CreateChatMastraServiceRouterOptions,
) {
	configureRuntimeState(options);

	return t.router({
		start: t.procedure.input(startInput).mutation(async ({ input }) => {
			startRuntimeService(input.organizationId);
			return { success: true };
		}),

		stop: t.procedure.mutation(async () => {
			await stopRuntimeService();
			return { success: true };
		}),

		workspace: t.router({
			searchFiles: t.procedure
				.input(searchFilesInput)
				.query(async ({ input }) => {
					return searchFiles({
						rootPath: input.rootPath,
						query: input.query,
						includeHidden: input.includeHidden,
						limit: input.limit,
					});
				}),
		}),

		session: t.router({
			create: t.procedure
				.input(createSessionInput)
				.mutation(({ input }) => createSessionRuntime(input)),

			list: t.procedure
				.input(workspaceIdInput)
				.query(({ input }) => listSessionsRuntime(input)),

			delete: t.procedure
				.input(sessionIdInput)
				.mutation(async ({ input }) => deleteSessionRuntime(input)),

			isActive: t.procedure.input(sessionIdInput).query(({ input }) => {
				return {
					active: hasRuntimeState(input.sessionId),
				};
			}),

			getDisplayState: t.procedure
				.input(sessionIdInput)
				.query(({ input }) => getDisplayStateRuntime(input)),

			ensureRuntime: t.procedure
				.input(ensureRuntimeInput)
				.mutation(async ({ input }) => ensureRuntimeState(input)),

			sendMessage: t.procedure
				.input(sendMessageInput)
				.mutation(async ({ input }) => sendMessageRuntime(input)),

			control: t.procedure
				.input(controlInput)
				.mutation(async ({ input }) => controlRuntime(input)),

			approval: t.router({
				respond: t.procedure
					.input(approvalRespondInput)
					.mutation(async ({ input }) => approvalRespondRuntime(input)),
			}),

			question: t.router({
				respond: t.procedure
					.input(questionRespondInput)
					.mutation(async ({ input }) => questionRespondRuntime(input)),
			}),

			plan: t.router({
				respond: t.procedure
					.input(planRespondInput)
					.mutation(async ({ input }) => planRespondRuntime(input)),
			}),
		}),
	});
}

export type ChatMastraServiceRouter = ReturnType<
	typeof createChatMastraServiceRouter
>;
