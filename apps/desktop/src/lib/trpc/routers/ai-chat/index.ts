import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	type ClaudeStreamEvent,
	claudeSessionManager,
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
					cwd: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				await claudeSessionManager.startSession({
					sessionId: input.sessionId,
					cwd: input.cwd,
				});
				return { success: true };
			}),

		interrupt: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.mutation(async ({ input }) => {
				await claudeSessionManager.interrupt({ sessionId: input.sessionId });
				return { success: true };
			}),

		stopSession: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.mutation(async ({ input }) => {
				await claudeSessionManager.stopSession({ sessionId: input.sessionId });
				return { success: true };
			}),

		isSessionActive: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.query(({ input }) => {
				return claudeSessionManager.isSessionActive(input.sessionId);
			}),

		getActiveSessions: publicProcedure.query(() => {
			return claudeSessionManager.getActiveSessions();
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

					claudeSessionManager.on("event", onEvent);

					return () => {
						claudeSessionManager.off("event", onEvent);
					};
				});
			}),
	});
};
