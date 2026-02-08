import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	readClaudeSessionMessages,
	scanClaudeSessions,
} from "./utils/claude-session-scanner";
import {
	type ClaudeStreamEvent,
	chatSessionManager,
	sessionStore,
} from "./utils/session-manager";

export const createAiChatRouter = () => {
	return router({
		getConfig: publicProcedure.query(() => ({
			proxyUrl: process.env.DURABLE_STREAM_URL || "http://localhost:8080",
			authToken:
				process.env.DURABLE_STREAM_AUTH_TOKEN ||
				process.env.DURABLE_STREAM_TOKEN ||
				null,
		})),

		startSession: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					workspaceId: z.string(),
					cwd: z.string(),
					paneId: z.string().optional(),
					tabId: z.string().optional(),
					model: z.string().optional(),
					permissionMode: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				await chatSessionManager.startSession({
					sessionId: input.sessionId,
					workspaceId: input.workspaceId,
					cwd: input.cwd,
					paneId: input.paneId,
					tabId: input.tabId,
					model: input.model,
					permissionMode: input.permissionMode,
				});
				return { success: true };
			}),

		restoreSession: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					cwd: z.string(),
					paneId: z.string().optional(),
					tabId: z.string().optional(),
					model: z.string().optional(),
					permissionMode: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				await chatSessionManager.restoreSession({
					sessionId: input.sessionId,
					cwd: input.cwd,
					paneId: input.paneId,
					tabId: input.tabId,
					model: input.model,
					permissionMode: input.permissionMode,
				});
				return { success: true };
			}),

		interrupt: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.mutation(async ({ input }) => {
				await chatSessionManager.interrupt({
					sessionId: input.sessionId,
				});
				return { success: true };
			}),

		stopSession: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.mutation(async ({ input }) => {
				await chatSessionManager.deactivateSession({
					sessionId: input.sessionId,
				});
				return { success: true };
			}),

		deleteSession: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.mutation(async ({ input }) => {
				await chatSessionManager.deleteSession({
					sessionId: input.sessionId,
				});
				return { success: true };
			}),

		updateSessionConfig: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					maxThinkingTokens: z.number().nullable().optional(),
					model: z.string().nullable().optional(),
					permissionMode: z
						.enum(["default", "acceptEdits", "bypassPermissions"])
						.nullable()
						.optional(),
				}),
			)
			.mutation(async ({ input }) => {
				await chatSessionManager.updateAgentConfig({
					sessionId: input.sessionId,
					maxThinkingTokens: input.maxThinkingTokens,
					model: input.model,
					permissionMode: input.permissionMode,
				});
				return { success: true };
			}),

		renameSession: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					title: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				await chatSessionManager.updateSessionMeta(input.sessionId, {
					title: input.title,
				});
				return { success: true };
			}),

		listSessions: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(async ({ input }) => {
				return sessionStore.listByWorkspace(input.workspaceId);
			}),

		getSession: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.query(async ({ input }) => {
				return (await sessionStore.get(input.sessionId)) ?? null;
			}),

		isSessionActive: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.query(({ input }) => {
				return chatSessionManager.isSessionActive(input.sessionId);
			}),

		getActiveSessions: publicProcedure.query(() => {
			return chatSessionManager.getActiveSessions();
		}),

		getClaudeSessionMessages: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.query(async ({ input }) => {
				return readClaudeSessionMessages({ sessionId: input.sessionId });
			}),

		scanClaudeSessions: publicProcedure
			.input(
				z
					.object({
						cursor: z.number().optional(),
						limit: z.number().min(1).max(100).optional(),
					})
					.optional(),
			)
			.query(async ({ input }) => {
				return scanClaudeSessions({
					cursor: input?.cursor ?? 0,
					limit: input?.limit ?? 30,
				});
			}),

		streamEvents: publicProcedure
			.input(z.object({ sessionId: z.string().optional() }))
			.subscription(({ input }) => {
				return observable<ClaudeStreamEvent>((emit) => {
					const onEvent = (event: ClaudeStreamEvent) => {
						if (input.sessionId && event.sessionId !== input.sessionId) {
							return;
						}
						emit.next(event);
					};

					chatSessionManager.on("event", onEvent);

					return () => {
						chatSessionManager.off("event", onEvent);
					};
				});
			}),
	});
};
