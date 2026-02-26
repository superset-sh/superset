import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import type { ChatService } from "../chat-service";
import { getSlashCommands, resolveSlashCommand } from "../slash-commands";
import { searchFiles } from "./file-search";
import { getMcpOverview } from "./mcp-overview";

const t = initTRPC.create({ transformer: superjson });

export const searchFilesInput = z.object({
	rootPath: z.string(),
	query: z.string(),
	includeHidden: z.boolean().default(false),
	limit: z.number().default(20),
});

export const getSlashCommandsInput = z.object({
	cwd: z.string(),
});

export const getMcpOverviewInput = z.object({
	cwd: z.string(),
});

export const resolveSlashCommandInput = z.object({
	cwd: z.string(),
	text: z.string(),
});
export const previewSlashCommandInput = resolveSlashCommandInput;

export const anthropicOAuthCodeInput = z.object({
	code: z.string().min(1),
});

export const openAIApiKeyInput = z.object({
	apiKey: z.string().min(1),
});

function resolveWorkspaceSlashCommand(input: { cwd: string; text: string }) {
	return resolveSlashCommand(input.cwd, input.text);
}

export function createChatServiceRouter(service: ChatService) {
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

			getSlashCommands: t.procedure
				.input(getSlashCommandsInput)
				.query(async ({ input }) => {
					return getSlashCommands(input.cwd);
				}),

			getMcpOverview: t.procedure
				.input(getMcpOverviewInput)
				.query(async ({ input }) => {
					return getMcpOverview(input.cwd);
				}),

			resolveSlashCommand: t.procedure
				.input(resolveSlashCommandInput)
				.mutation(async ({ input }) => {
					return resolveWorkspaceSlashCommand(input);
				}),

			previewSlashCommand: t.procedure
				.input(resolveSlashCommandInput)
				.query(async ({ input }) => {
					return resolveWorkspaceSlashCommand(input);
				}),
		}),

		auth: t.router({
			getAnthropicStatus: t.procedure.query(() => {
				return service.getAnthropicAuthStatus();
			}),
			getOpenAIStatus: t.procedure.query(() => {
				return service.getOpenAIAuthStatus();
			}),
			startAnthropicOAuth: t.procedure.mutation(() => {
				return service.startAnthropicOAuth();
			}),
			completeAnthropicOAuth: t.procedure
				.input(anthropicOAuthCodeInput)
				.mutation(async ({ input }) => {
					return service.completeAnthropicOAuth({ code: input.code });
				}),
			cancelAnthropicOAuth: t.procedure.mutation(() => {
				return service.cancelAnthropicOAuth();
			}),
			setOpenAIApiKey: t.procedure
				.input(openAIApiKeyInput)
				.mutation(({ input }) => {
					return service.setOpenAIApiKey({ apiKey: input.apiKey });
				}),
			clearOpenAIApiKey: t.procedure.mutation(() => {
				return service.clearOpenAIApiKey();
			}),
		}),
	});
}

export type ChatServiceRouter = ReturnType<typeof createChatServiceRouter>;
