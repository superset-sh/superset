import type { AppRouter } from "@superset/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { initTRPC } from "@trpc/server";
import { createMastraCode } from "mastracode";
import superjson from "superjson";
import { searchFiles } from "./utils/file-search";
import {
	destroyRuntime,
	getRuntimeMcpOverview,
	onUserPromptSubmit,
	type RuntimeSession,
	reloadHookConfig,
	runSessionStartHook,
	subscribeToSessionEvents,
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

export interface ChatMastraServiceOptions {
	headers: () => Record<string, string> | Promise<Record<string, string>>;
	apiUrl: string;
}

export class ChatMastraService {
	private readonly runtimes = new Map<string, RuntimeSession>();
	private readonly apiClient: ReturnType<typeof createTRPCClient<AppRouter>>;

	constructor(readonly opts: ChatMastraServiceOptions) {
		this.apiClient = createTRPCClient<AppRouter>({
			links: [
				httpBatchLink({
					url: `${opts.apiUrl}/api/trpc`,
					transformer: superjson,
					async headers() {
						return opts.headers();
					},
				}),
			],
		});
	}

	private async getOrCreateRuntime(
		sessionId: string,
		cwd?: string,
	): Promise<RuntimeSession> {
		const existing = this.runtimes.get(sessionId);
		if (existing) {
			if (cwd && existing.cwd !== cwd) {
				await destroyRuntime(existing);
				this.runtimes.delete(sessionId);
			} else {
				reloadHookConfig(existing);
				return existing;
			}
		}

		const runtimeCwd = cwd ?? process.cwd();
		const runtimeMastra = await createMastraCode({ cwd: runtimeCwd });
		if (runtimeMastra.mcpManager?.hasServers()) {
			await runtimeMastra.mcpManager.init().catch(() => {});
		}
		runtimeMastra.hookManager?.setSessionId(sessionId);
		await runtimeMastra.harness.init();
		runtimeMastra.harness.setResourceId({ resourceId: sessionId });
		await runtimeMastra.harness.selectOrCreateThread();

		const runtime: RuntimeSession = {
			sessionId,
			harness: runtimeMastra.harness,
			mcpManager: runtimeMastra.mcpManager,
			hookManager: runtimeMastra.hookManager,
			cwd: runtimeCwd,
		};
		await runSessionStartHook(runtime).catch(() => {});
		subscribeToSessionEvents(runtime, this.apiClient);
		this.runtimes.set(sessionId, runtime);
		return runtime;
	}

	createRouter() {
		const t = initTRPC.create({ transformer: superjson });

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
						const runtime = await this.getOrCreateRuntime(
							input.sessionId,
							input.cwd,
						);
						return getRuntimeMcpOverview(runtime);
					}),
			}),

			session: t.router({
				getDisplayState: t.procedure
					.input(displayStateInput)
					.query(async ({ input }) => {
						const runtime = await this.getOrCreateRuntime(
							input.sessionId,
							input.cwd,
						);
						return runtime.harness.getDisplayState();
					}),

				listMessages: t.procedure
					.input(listMessagesInput)
					.query(async ({ input }) => {
						const runtime = await this.getOrCreateRuntime(
							input.sessionId,
							input.cwd,
						);
						return runtime.harness.listMessages();
					}),

				sendMessage: t.procedure
					.input(sendMessageInput)
					.mutation(async ({ input }) => {
						const runtime = await this.getOrCreateRuntime(
							input.sessionId,
							input.cwd,
						);
						const userMessage =
							input.payload.content.trim() || "[non-text message]";
						await onUserPromptSubmit(runtime, userMessage);
						const selectedModel = input.metadata?.model?.trim();
						if (selectedModel) {
							await runtime.harness.switchModel({
								modelId: selectedModel,
								scope: "thread",
							});
						}
						return runtime.harness.sendMessage(input.payload);
					}),

				stop: t.procedure.input(sessionIdInput).mutation(async ({ input }) => {
					const runtime = await this.getOrCreateRuntime(input.sessionId);
					runtime.harness.abort();
				}),

				abort: t.procedure.input(sessionIdInput).mutation(async ({ input }) => {
					const runtime = await this.getOrCreateRuntime(input.sessionId);
					runtime.harness.abort();
				}),

				approval: t.router({
					respond: t.procedure
						.input(approvalRespondInput)
						.mutation(async ({ input }) => {
							const runtime = await this.getOrCreateRuntime(input.sessionId);
							return runtime.harness.respondToToolApproval(input.payload);
						}),
				}),

				question: t.router({
					respond: t.procedure
						.input(questionRespondInput)
						.mutation(async ({ input }) => {
							const runtime = await this.getOrCreateRuntime(input.sessionId);
							return runtime.harness.respondToQuestion(input.payload);
						}),
				}),

				plan: t.router({
					respond: t.procedure
						.input(planRespondInput)
						.mutation(async ({ input }) => {
							const runtime = await this.getOrCreateRuntime(input.sessionId);
							return runtime.harness.respondToPlanApproval(input.payload);
						}),
				}),
			}),
		});
	}
}

export type ChatMastraServiceRouter = ReturnType<
	ChatMastraService["createRouter"]
>;
