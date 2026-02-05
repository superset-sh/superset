/**
 * AI Chat tRPC Router
 *
 * Provides local control of Claude sessions via tRPC.
 * Uses observable pattern for streaming (required by trpc-electron).
 */

import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	type ClaudeStreamEvent,
	claudeSessionManager,
} from "./utils/session-manager";

export const createAiChatRouter = () => {
	return router({
		/**
		 * Start a Claude session.
		 */
		startSession: publicProcedure
			.input(
				z.object({
					sessionId: z.string(),
					cwd: z.string(),
					claudeSessionId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				await claudeSessionManager.startSession({
					sessionId: input.sessionId,
					cwd: input.cwd,
					claudeSessionId: input.claudeSessionId,
				});
				return { success: true };
			}),

		/**
		 * Interrupt an active Claude session (SIGINT).
		 */
		interrupt: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.mutation(async ({ input }) => {
				await claudeSessionManager.interrupt({ sessionId: input.sessionId });
				return { success: true };
			}),

		/**
		 * Stop a Claude session completely.
		 */
		stopSession: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.mutation(async ({ input }) => {
				await claudeSessionManager.stopSession({ sessionId: input.sessionId });
				return { success: true };
			}),

		/**
		 * Check if a session is active.
		 */
		isSessionActive: publicProcedure
			.input(z.object({ sessionId: z.string() }))
			.query(({ input }) => {
				return claudeSessionManager.isSessionActive(input.sessionId);
			}),

		/**
		 * Get all active session IDs.
		 */
		getActiveSessions: publicProcedure.query(() => {
			return claudeSessionManager.getActiveSessions();
		}),

		/**
		 * Subscribe to stream events from Claude sessions.
		 *
		 * This uses the observable pattern required by trpc-electron.
		 * Events are filtered by sessionId if provided.
		 */
		streamEvents: publicProcedure
			.input(z.object({ sessionId: z.string().optional() }))
			.subscription(({ input }) => {
				return observable<ClaudeStreamEvent>((emit) => {
					const onEvent = (event: ClaudeStreamEvent) => {
						// Filter by sessionId if specified
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
