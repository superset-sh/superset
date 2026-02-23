import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import type { ChatService } from "../chat-service";
import { getSlashCommands, resolveSlashCommand } from "../slash-commands";
import { searchFiles } from "./file-search";

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

export const resolveSlashCommandInput = z.object({
	cwd: z.string(),
	text: z.string(),
});
export const previewSlashCommandInput = resolveSlashCommandInput;

export const sessionIdInput = z.object({
	sessionId: z.string().uuid(),
});

export const ensureRuntimeInput = z.object({
	sessionId: z.string().uuid(),
	cwd: z.string().optional(),
});

function resolveWorkspaceSlashCommand(input: { cwd: string; text: string }) {
	return resolveSlashCommand(input.cwd, input.text);
}

export function createChatServiceRouter(service: ChatService) {
	return t.router({
		start: t.procedure
			.input(z.object({ organizationId: z.string() }))
			.mutation(async ({ input }) => {
				await service.start(input);
				return { success: true };
			}),

		stop: t.procedure.mutation(() => {
			service.stop();
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

			getSlashCommands: t.procedure
				.input(getSlashCommandsInput)
				.query(async ({ input }) => {
					return getSlashCommands(input.cwd);
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

		session: t.router({
			isActive: t.procedure.input(sessionIdInput).query(({ input }) => {
				return {
					active: service.hasWatcher(input.sessionId),
				};
			}),

			ensureRuntime: t.procedure
				.input(ensureRuntimeInput)
				.mutation(async ({ input }) => {
					return service.ensureWatcher(input.sessionId, input.cwd);
				}),

			config: t.procedure
				.input(
					z.object({
						sessionId: z.string().uuid(),
						model: z.string().optional(),
						cwd: z.string().optional(),
						permissionMode: z.string().optional(),
						thinkingEnabled: z.boolean().optional(),
					}),
				)
				.mutation(() => {
					// Config is applied directly on the service's watcher for this session
					// For now this is a no-op placeholder — the stream watcher reads config from its SessionHost
					return { success: true };
				}),
		}),
	});
}

export type ChatServiceRouter = ReturnType<typeof createChatServiceRouter>;
