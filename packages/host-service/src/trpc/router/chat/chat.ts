import { z } from "zod";
import { protectedProcedure, router } from "../../index";

const thinkingLevelSchema = z.enum(["off", "low", "medium", "high", "xhigh"]);

const sessionInput = z.object({
	sessionId: z.uuid(),
	workspaceId: z.uuid(),
});

// Slash-command discovery / preview / resolve are workspace-scoped, not
// session-scoped — they only need a workspaceId so they work in fresh
// chats before the first message creates a session.
const workspaceSlashInput = z.object({
	workspaceId: z.uuid(),
});

const sendMessagePayloadSchema = z.object({
	content: z.string(),
	files: z
		.array(
			z.object({
				data: z.string(),
				mediaType: z.string(),
				filename: z.string().optional(),
			}),
		)
		.optional(),
});

const messageMetadataSchema = z
	.object({
		model: z.string().optional(),
		thinkingLevel: thinkingLevelSchema.optional(),
	})
	.optional();

export const chatRouter = router({
	getDisplayState: protectedProcedure
		.input(sessionInput)
		.query(({ ctx, input }) => {
			return ctx.runtime.chat.getDisplayState(input);
		}),

	listMessages: protectedProcedure
		.input(sessionInput)
		.query(({ ctx, input }) => {
			return ctx.runtime.chat.listMessages(input);
		}),

	getSnapshot: protectedProcedure
		.input(sessionInput)
		.query(({ ctx, input }) => {
			return ctx.runtime.chat.getSnapshot(input);
		}),

	sendMessage: protectedProcedure
		.input(
			sessionInput.extend({
				payload: sendMessagePayloadSchema,
				metadata: messageMetadataSchema,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const result = await ctx.runtime.chat.sendMessage(input);
			// Fire-and-forget cloud lastActiveAt update so the session selector
			// keeps reordering after activity. Failures here must not block the
			// turn — the user already sees their message land via the snapshot.
			void ctx.api.chat.updateSession
				.mutate({ sessionId: input.sessionId, lastActiveAt: new Date() })
				.catch(() => {});
			return result;
		}),

	endSession: protectedProcedure
		.input(sessionInput)
		.mutation(async ({ ctx, input }) => {
			await ctx.runtime.chat.disposeRuntime(input.sessionId, input.workspaceId);
			return { ok: true };
		}),

	restartFromMessage: protectedProcedure
		.input(
			sessionInput.extend({
				messageId: z.string().min(1),
				payload: sendMessagePayloadSchema,
				metadata: messageMetadataSchema,
			}),
		)
		.mutation(({ ctx, input }) => {
			return ctx.runtime.chat.restartFromMessage(input);
		}),

	stop: protectedProcedure.input(sessionInput).mutation(({ ctx, input }) => {
		return ctx.runtime.chat.stop(input);
	}),

	respondToApproval: protectedProcedure
		.input(
			sessionInput.extend({
				payload: z.object({
					decision: z.enum(["approve", "decline", "always_allow_category"]),
				}),
			}),
		)
		.mutation(({ ctx, input }) => {
			return ctx.runtime.chat.respondToApproval(input);
		}),

	respondToQuestion: protectedProcedure
		.input(
			sessionInput.extend({
				payload: z.object({
					questionId: z.string(),
					answer: z.string(),
				}),
			}),
		)
		.mutation(({ ctx, input }) => {
			return ctx.runtime.chat.respondToQuestion(input);
		}),

	respondToPlan: protectedProcedure
		.input(
			sessionInput.extend({
				payload: z.object({
					planId: z.string(),
					response: z.object({
						action: z.enum(["approved", "rejected"]),
						feedback: z.string().optional(),
					}),
				}),
			}),
		)
		.mutation(({ ctx, input }) => {
			return ctx.runtime.chat.respondToPlan(input);
		}),

	getSlashCommands: protectedProcedure
		.input(workspaceSlashInput)
		.query(({ ctx, input }) => {
			return ctx.runtime.chat.getSlashCommands(input);
		}),

	resolveSlashCommand: protectedProcedure
		.input(
			workspaceSlashInput.extend({
				text: z.string(),
			}),
		)
		.mutation(({ ctx, input }) => {
			return ctx.runtime.chat.resolveSlashCommand(input);
		}),

	previewSlashCommand: protectedProcedure
		.input(
			workspaceSlashInput.extend({
				text: z.string(),
			}),
		)
		.mutation(({ ctx, input }) => {
			return ctx.runtime.chat.previewSlashCommand(input);
		}),

	getMcpOverview: protectedProcedure
		.input(sessionInput)
		.query(({ ctx, input }) => {
			return ctx.runtime.chat.getMcpOverview(input);
		}),
});
