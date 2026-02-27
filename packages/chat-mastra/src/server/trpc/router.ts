import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { searchFiles } from "./utils/file-search";
import {
	getOrCreateRuntime,
	getRuntimeMcpOverview,
	runUserPromptHook,
} from "./utils/runtime";
import {
	approvalRespondInput,
	displayStateInput,
	listMessagesInput,
	mcpOverviewInput,
	planRespondInput,
	questionRespondInput,
	searchFilesInput,
	sendMessageInput,
	sessionIdInput,
} from "./zod";

const t = initTRPC.create({ transformer: superjson });

export function createChatMastraServiceRouter() {
	return t.router({
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

			getMcpOverview: t.procedure
				.input(mcpOverviewInput)
				.query(async ({ input }) => {
					const runtime = await getOrCreateRuntime(input.sessionId, input.cwd);
					return getRuntimeMcpOverview(runtime);
				}),
		}),

		session: t.router({
			getDisplayState: t.procedure
				.input(displayStateInput)
				.query(async ({ input }) => {
					const runtime = await getOrCreateRuntime(input.sessionId, input.cwd);
					return runtime.harness.getDisplayState();
				}),

			listMessages: t.procedure
				.input(listMessagesInput)
				.query(async ({ input }) => {
					const runtime = await getOrCreateRuntime(input.sessionId, input.cwd);
					return runtime.harness.listMessages();
				}),

			sendMessage: t.procedure
				.input(sendMessageInput)
				.mutation(async ({ input }) => {
					const runtime = await getOrCreateRuntime(input.sessionId, input.cwd);
					const userMessage =
						input.payload.content.trim() || "[non-text message]";
					await runUserPromptHook(runtime, userMessage);
					const selectedModel = input.metadata?.model?.trim();
					if (selectedModel) {
						await runtime.harness.switchModel({
							modelId: selectedModel,
							scope: "thread",
						});
					}
					const sendResult = await runtime.harness.sendMessage(input.payload);
					return sendResult;
				}),

			stop: t.procedure.input(sessionIdInput).mutation(async ({ input }) => {
				const runtime = await getOrCreateRuntime(input.sessionId);
				runtime.harness.abort();
			}),

			abort: t.procedure.input(sessionIdInput).mutation(async ({ input }) => {
				const runtime = await getOrCreateRuntime(input.sessionId);
				runtime.harness.abort();
			}),

			approval: t.router({
				respond: t.procedure
					.input(approvalRespondInput)
					.mutation(async ({ input }) => {
						const runtime = await getOrCreateRuntime(input.sessionId);
						return runtime.harness.respondToToolApproval(input.payload);
					}),
			}),

			question: t.router({
				respond: t.procedure
					.input(questionRespondInput)
					.mutation(async ({ input }) => {
						const runtime = await getOrCreateRuntime(input.sessionId);
						return runtime.harness.respondToQuestion(input.payload);
					}),
			}),

			plan: t.router({
				respond: t.procedure
					.input(planRespondInput)
					.mutation(async ({ input }) => {
						const runtime = await getOrCreateRuntime(input.sessionId);
						return runtime.harness.respondToPlanApproval(input.payload);
					}),
			}),
		}),
	});
}

export type ChatMastraServiceRouter = ReturnType<
	typeof createChatMastraServiceRouter
>;
