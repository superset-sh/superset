import { z } from "zod";
import { protectedProcedure, router } from "../../index";

const thinkingLevelSchema = z.enum(["off", "low", "medium", "high", "xhigh"]);

const sessionInput = z.object({
	sessionId: z.uuid(),
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

	sendMessage: protectedProcedure
		.input(
			sessionInput.extend({
				payload: sendMessagePayloadSchema,
				metadata: z
					.object({
						model: z.string().optional(),
						thinkingLevel: thinkingLevelSchema.optional(),
					})
					.optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			return ctx.runtime.chat.sendMessage(input);
		}),

	restartFromMessage: protectedProcedure
		.input(
			sessionInput.extend({
				messageId: z.string().min(1),
				payload: sendMessagePayloadSchema,
				metadata: z
					.object({
						model: z.string().optional(),
						thinkingLevel: thinkingLevelSchema.optional(),
					})
					.optional(),
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
		.input(sessionInput)
		.query(({ ctx, input }) => {
			return ctx.runtime.chat.getSlashCommands(input);
		}),

	resolveSlashCommand: protectedProcedure
		.input(
			sessionInput.extend({
				text: z.string(),
			}),
		)
		.mutation(({ ctx, input }) => {
			return ctx.runtime.chat.resolveSlashCommand(input);
		}),

	previewSlashCommand: protectedProcedure
		.input(
			sessionInput.extend({
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
