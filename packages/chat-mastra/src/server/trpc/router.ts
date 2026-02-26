import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { searchFiles } from "./utils/file-search";
import { getOrCreateRuntime } from "./utils/runtime";
import { getMastraCodeMcpBridgeDebugInfo } from "./utils/runtime/mcp-bridge";
import {
	approvalRespondInput,
	connectInput,
	displayStateInput,
	listMessagesInput,
	mcpDebugInput,
	planRespondInput,
	questionRespondInput,
	searchFilesInput,
	sendMessageInput,
	sessionIdInput,
} from "./zod";

const t = initTRPC.create({ transformer: superjson });

export interface ChatMastraServiceRouterOptions {
	getAuthToken?: () => Promise<string | null> | string | null;
}

export function createChatMastraServiceRouter(
	options: ChatMastraServiceRouterOptions = {},
) {
	const getRuntimeForSession = async (input: {
		sessionId: string;
		cwd?: string;
	}) => {
		const authToken = await options.getAuthToken?.();
		return getOrCreateRuntime(input.sessionId, input.cwd, {
			authToken: authToken ?? undefined,
		});
	};

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
		}),

		session: t.router({
			connect: t.procedure.input(connectInput).query(async ({ input }) => {
				await getRuntimeForSession(input);
				return { connected: true };
			}),

			mcpDebug: t.procedure.input(mcpDebugInput).query(async ({ input }) => {
				const runtime = await getRuntimeForSession(input);
				const mcpManager = runtime.mcpManager;
				if (input.reload && mcpManager?.hasServers()) {
					await mcpManager.reload();
				}

				const managerConfig = mcpManager?.getConfig();
				const configuredServerNames = Object.keys(
					managerConfig?.mcpServers ?? {},
				).sort((left, right) => left.localeCompare(right));
				const serverConfigs = Object.fromEntries(
					Object.entries(managerConfig?.mcpServers ?? {}).map(
						([name, config]) => [
							name,
							{
								command: config.command,
								args: config.args ?? [],
							},
						],
					),
				);

				return {
					cwd: runtime.cwd,
					bridge: getMastraCodeMcpBridgeDebugInfo(runtime.cwd),
					manager: {
						present: Boolean(mcpManager),
						hasServers: mcpManager?.hasServers() ?? false,
						configPaths: mcpManager?.getConfigPaths() ?? null,
						configuredServerNames,
						serverConfigs,
						statuses: mcpManager?.getServerStatuses() ?? [],
					},
				};
			}),

			getDisplayState: t.procedure
				.input(displayStateInput)
				.query(async ({ input }) => {
					const runtime = await getRuntimeForSession(input);
					return runtime.harness.getDisplayState();
				}),

			listMessages: t.procedure
				.input(listMessagesInput)
				.query(async ({ input }) => {
					const runtime = await getRuntimeForSession(input);
					return runtime.harness.listMessages();
				}),

			sendMessage: t.procedure
				.input(sendMessageInput)
				.mutation(async ({ input }) => {
					const runtime = await getRuntimeForSession(input);
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
				const runtime = await getRuntimeForSession(input);
				runtime.harness.abort();
			}),

			abort: t.procedure.input(sessionIdInput).mutation(async ({ input }) => {
				const runtime = await getRuntimeForSession(input);
				runtime.harness.abort();
			}),

			approval: t.router({
				respond: t.procedure
					.input(approvalRespondInput)
					.mutation(async ({ input }) => {
						const runtime = await getRuntimeForSession(input);
						return runtime.harness.respondToToolApproval(input.payload);
					}),
			}),

			question: t.router({
				respond: t.procedure
					.input(questionRespondInput)
					.mutation(async ({ input }) => {
						const runtime = await getRuntimeForSession(input);
						return runtime.harness.respondToQuestion(input.payload);
					}),
			}),

			plan: t.router({
				respond: t.procedure
					.input(planRespondInput)
					.mutation(async ({ input }) => {
						const runtime = await getRuntimeForSession(input);
						return runtime.harness.respondToPlanApproval(input.payload);
					}),
			}),
		}),
	});
}

export type ChatMastraServiceRouter = ReturnType<
	typeof createChatMastraServiceRouter
>;
