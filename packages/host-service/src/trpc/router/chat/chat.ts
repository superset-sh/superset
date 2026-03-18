import { z } from "zod";
import { publicProcedure, router } from "../../index";

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
	getDisplayState: publicProcedure
		.input(sessionInput)
		.query(({ ctx, input }) => {
			return ctx.runtime.chat.getDisplayState(input);
		}),

	listMessages: publicProcedure.input(sessionInput).query(({ ctx, input }) => {
		return ctx.runtime.chat.listMessages(input);
	}),

	sendMessage: publicProcedure
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

	restartFromMessage: publicProcedure
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

	stop: publicProcedure.input(sessionInput).mutation(({ ctx, input }) => {
		return ctx.runtime.chat.stop(input);
	}),

	respondToApproval: publicProcedure
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

	respondToQuestion: publicProcedure
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

	respondToPlan: publicProcedure
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

	getSlashCommands: publicProcedure
		.input(sessionInput)
		.query(({ ctx, input }) => {
			return ctx.runtime.chat.getSlashCommands(input);
		}),

	resolveSlashCommand: publicProcedure
		.input(
			sessionInput.extend({
				text: z.string(),
			}),
		)
		.mutation(({ ctx, input }) => {
			return ctx.runtime.chat.resolveSlashCommand(input);
		}),

	previewSlashCommand: publicProcedure
		.input(
			sessionInput.extend({
				text: z.string(),
			}),
		)
		.mutation(({ ctx, input }) => {
			return ctx.runtime.chat.previewSlashCommand(input);
		}),

	getMcpOverview: publicProcedure
		.input(sessionInput)
		.query(({ ctx, input }) => {
			return ctx.runtime.chat.getMcpOverview(input);
		}),
});
