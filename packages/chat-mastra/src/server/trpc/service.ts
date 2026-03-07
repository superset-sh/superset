import type { AppRouter } from "@superset/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { initTRPC } from "@trpc/server";
import { createMastraCode } from "mastracode";
import superjson from "superjson";
import { searchFiles } from "./utils/file-search";
import {
	authenticateRuntimeMcpServer,
	destroyRuntime,
	generateAndSetTitle,
	getRuntimeMcpOverview,
	onUserPromptSubmit,
	type RuntimeSession,
	reloadHookConfig,
	restartRuntimeFromUserMessage,
	runSessionStartHook,
	subscribeToSessionEvents,
} from "./utils/runtime";
import { getSupersetMcpTools } from "./utils/runtime/superset-mcp";
import {
	approvalRespondInput,
	displayStateInput,
	listMessagesInput,
	mcpOverviewInput,
	mcpServerAuthInput,
	planRespondInput,
	questionRespondInput,
	restartFromMessageInput,
	searchFilesInput,
	sendMessageInput,
	sessionIdInput,
} from "./zod";

const ENABLE_MASTRA_MCP_SERVERS = false;

export interface ChatMastraServiceOptions {
	headers: () => Record<string, string> | Promise<Record<string, string>>;
	apiUrl: string;
}

export class ChatMastraService {
	private readonly runtimes = new Map<string, RuntimeSession>();
	private readonly runtimeCreations = new Map<
		string,
		Promise<RuntimeSession>
	>();
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
		const runtimeCwd = cwd ?? process.cwd();
		const runtimeKey = `${sessionId}:${runtimeCwd}`;

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

		const existingCreation = this.runtimeCreations.get(runtimeKey);
		if (existingCreation) {
			return existingCreation;
		}

		const creationPromise = (async () => {
			try {
				const extraTools = await getSupersetMcpTools(
					() => Promise.resolve(this.opts.headers()),
					this.opts.apiUrl,
				);
				const runtimeMastra = await createMastraCode({
					cwd: runtimeCwd,
					extraTools,
					disableMcp: !ENABLE_MASTRA_MCP_SERVERS,
				});
				runtimeMastra.hookManager?.setSessionId(sessionId);
				await runtimeMastra.harness.init();
				runtimeMastra.harness.setResourceId({ resourceId: sessionId });
				await runtimeMastra.harness.selectOrCreateThread();

				const runtime: RuntimeSession = {
					sessionId,
					harness: runtimeMastra.harness,
					mcpManager: runtimeMastra.mcpManager,
					hookManager: runtimeMastra.hookManager,
					mcpManualStatuses: new Map(),
					lastErrorMessage: null,
					pendingSandboxQuestion: null,
					cwd: runtimeCwd,
				};
				await runSessionStartHook(runtime).catch(() => {});
				subscribeToSessionEvents(runtime);
				this.runtimes.set(sessionId, runtime);
				return runtime;
			} finally {
				this.runtimeCreations.delete(runtimeKey);
			}
		})();

		this.runtimeCreations.set(runtimeKey, creationPromise);
		return creationPromise;
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
						if (!ENABLE_MASTRA_MCP_SERVERS) {
							return { sourcePath: null, servers: [] };
						}

						const runtime = await this.getOrCreateRuntime(
							input.sessionId,
							input.cwd,
						);
						return getRuntimeMcpOverview(runtime);
					}),
				authenticateMcpServer: t.procedure
					.input(mcpServerAuthInput)
					.mutation(async ({ input }) => {
						if (!ENABLE_MASTRA_MCP_SERVERS) {
							return { sourcePath: null, servers: [] };
						}

						const runtime = await this.getOrCreateRuntime(
							input.sessionId,
							input.cwd,
						);
						return authenticateRuntimeMcpServer(runtime, input.serverName);
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
						const displayState = runtime.harness.getDisplayState();
						const currentMessage = displayState.currentMessage as {
							role?: string;
							stopReason?: string;
							errorMessage?: string;
						} | null;
						const currentMessageError =
							currentMessage?.role === "assistant" &&
							typeof currentMessage.errorMessage === "string" &&
							currentMessage.errorMessage.trim()
								? currentMessage.errorMessage.trim()
								: null;
						const sandboxPendingQuestion = runtime.pendingSandboxQuestion
							? {
									questionId: runtime.pendingSandboxQuestion.questionId,
									question: `Grant sandbox access to "${runtime.pendingSandboxQuestion.path}"?`,
									options: [
										{
											label: "Yes",
											description: `Allow access. Reason: ${runtime.pendingSandboxQuestion.reason}`,
										},
										{
											label: "No",
											description: "Deny access.",
										},
									],
								}
							: null;
						return {
							...displayState,
							pendingQuestion:
								displayState.pendingQuestion ?? sandboxPendingQuestion,
							errorMessage: currentMessageError ?? runtime.lastErrorMessage,
						};
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
						runtime.lastErrorMessage = null;
						const userMessage =
							input.payload.content.trim() || "[non-text message]";
						await onUserPromptSubmit(runtime, userMessage);
						const submittedUserMessage = input.payload.content.trim();
						const selectedModel = input.metadata?.model?.trim();
						if (selectedModel) {
							await runtime.harness.switchModel({
								modelId: selectedModel,
								scope: "thread",
							});
						}
						void generateAndSetTitle(runtime, this.apiClient, {
							submittedUserMessage:
								submittedUserMessage.length > 0
									? submittedUserMessage
									: undefined,
						});
						return runtime.harness.sendMessage(input.payload);
					}),

				restartFromMessage: t.procedure
					.input(restartFromMessageInput)
					.mutation(async ({ input }) => {
						const runtime = await this.getOrCreateRuntime(
							input.sessionId,
							input.cwd,
						);
						runtime.lastErrorMessage = null;
						const userMessage =
							input.payload.content.trim() || "[non-text message]";
						await onUserPromptSubmit(runtime, userMessage);
						const submittedUserMessage = input.payload.content.trim();
						await restartRuntimeFromUserMessage(runtime, {
							messageId: input.messageId,
							payload: input.payload,
							metadata: input.metadata,
						});
						void generateAndSetTitle(runtime, this.apiClient, {
							submittedUserMessage:
								submittedUserMessage.length > 0
									? submittedUserMessage
									: undefined,
						});
					}),

				stop: t.procedure.input(sessionIdInput).mutation(async ({ input }) => {
					const runtime = await this.getOrCreateRuntime(
						input.sessionId,
						input.cwd,
					);
					runtime.harness.abort();
				}),

				abort: t.procedure.input(sessionIdInput).mutation(async ({ input }) => {
					const runtime = await this.getOrCreateRuntime(
						input.sessionId,
						input.cwd,
					);
					runtime.harness.abort();
				}),

				approval: t.router({
					respond: t.procedure
						.input(approvalRespondInput)
						.mutation(async ({ input }) => {
							const runtime = await this.getOrCreateRuntime(
								input.sessionId,
								input.cwd,
							);
							return runtime.harness.respondToToolApproval(input.payload);
						}),
				}),

				question: t.router({
					respond: t.procedure
						.input(questionRespondInput)
						.mutation(async ({ input }) => {
							const runtime = await this.getOrCreateRuntime(
								input.sessionId,
								input.cwd,
							);
							if (
								runtime.pendingSandboxQuestion?.questionId ===
								input.payload.questionId
							) {
								runtime.pendingSandboxQuestion = null;
							}
							return runtime.harness.respondToQuestion(input.payload);
						}),
				}),

				plan: t.router({
					respond: t.procedure
						.input(planRespondInput)
						.mutation(async ({ input }) => {
							const runtime = await this.getOrCreateRuntime(
								input.sessionId,
								input.cwd,
							);
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
