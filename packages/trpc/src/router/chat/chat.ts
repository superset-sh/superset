import { db } from "@superset/db/client";
import { chatSessions } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { uploadChatAttachment } from "./utils/upload-chat-attachment";

const AVAILABLE_MODELS = [
	{
		id: "anthropic/claude-opus-4-6",
		name: "Opus 4.6",
		provider: "Anthropic",
	},
	{
		id: "anthropic/claude-sonnet-4-6",
		name: "Sonnet 4.6",
		provider: "Anthropic",
	},
	{
		id: "anthropic/claude-haiku-4-5",
		name: "Haiku 4.5",
		provider: "Anthropic",
	},
	{
		id: "openai/gpt-5.4",
		name: "GPT-5.4",
		provider: "OpenAI",
	},
	{
		id: "openai/gpt-5.3-codex",
		name: "GPT-5.3 Codex",
		provider: "OpenAI",
	},
];

export const chatRouter = {
	getModels: protectedProcedure.query(() => {
		return { models: AVAILABLE_MODELS };
	}),

	uploadAttachment: protectedProcedure
		.input(
			z.object({
				sessionId: z.uuid(),
				filename: z.string().min(1).max(255),
				mediaType: z.string().min(1).max(255),
				fileData: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [sessionRecord] = await db
				.select({ id: chatSessions.id })
				.from(chatSessions)
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.createdBy, ctx.session.user.id),
					),
				)
				.limit(1);

			if (!sessionRecord) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat session not found",
				});
			}

			const result = await uploadChatAttachment(input);
			return result;
		}),

	updateTitle: protectedProcedure
		.input(z.object({ sessionId: z.uuid(), title: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const [updated] = await db
				.update(chatSessions)
				.set({ title: input.title })
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.createdBy, ctx.session.user.id),
					),
				)
				.returning({ id: chatSessions.id });
			return { updated: !!updated };
		}),
} satisfies TRPCRouterRecord;
