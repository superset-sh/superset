import { db, dbWs } from "@superset/db/client";
import { chatSessions } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { authenticatedProcedure } from "../../trpc";
import { uploadChatAttachment } from "./utils/upload-chat-attachment";

const AVAILABLE_MODELS = [
	{
		id: "anthropic/claude-opus-4-7",
		name: "Opus 4.7",
		provider: "Anthropic",
	},
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
		id: "openai/gpt-5.5",
		name: "GPT-5.5",
		provider: "OpenAI",
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
	getModels: authenticatedProcedure.query(() => {
		return { models: AVAILABLE_MODELS };
	}),

	createSession: authenticatedProcedure
		.input(
			z.object({
				sessionId: z.uuid(),
				v2WorkspaceId: z.uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No active organization selected",
				});
			}

			await db
				.insert(chatSessions)
				.values({
					id: input.sessionId,
					organizationId,
					createdBy: ctx.userId,
					v2WorkspaceId: input.v2WorkspaceId,
				})
				.onConflictDoNothing();

			return {
				sessionId: input.sessionId,
			};
		}),

	updateSession: authenticatedProcedure
		.input(
			z.object({
				sessionId: z.uuid(),
				title: z.string().optional(),
				lastActiveAt: z.date().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No active organization selected",
				});
			}

			const updates: Partial<typeof chatSessions.$inferInsert> = {};
			if (input.title !== undefined) {
				updates.title = input.title;
			}
			if (input.lastActiveAt !== undefined) {
				updates.lastActiveAt = input.lastActiveAt;
			}

			if (Object.keys(updates).length === 0) {
				return { updated: false };
			}

			const [updated] = await db
				.update(chatSessions)
				.set(updates)
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, organizationId),
						eq(chatSessions.createdBy, ctx.userId),
					),
				)
				.returning({ id: chatSessions.id });

			return { updated: !!updated };
		}),

	deleteSession: authenticatedProcedure
		.input(z.object({ sessionId: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No active organization selected",
				});
			}

			const result = await dbWs.transaction(async (tx) => {
				const [deleted] = await tx
					.delete(chatSessions)
					.where(
						and(
							eq(chatSessions.id, input.sessionId),
							eq(chatSessions.organizationId, organizationId),
							eq(chatSessions.createdBy, ctx.userId),
						),
					)
					.returning({ id: chatSessions.id });

				const txid = await getCurrentTxid(tx);

				return { deleted, txid };
			});
			const { deleted, txid } = result;

			return { deleted: !!deleted, txid };
		}),

	uploadAttachment: authenticatedProcedure
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
						eq(chatSessions.createdBy, ctx.userId),
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

	updateTitle: authenticatedProcedure
		.input(z.object({ sessionId: z.uuid(), title: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const [updated] = await db
				.update(chatSessions)
				.set({ title: input.title })
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.createdBy, ctx.userId),
					),
				)
				.returning({ id: chatSessions.id });

			return { updated: !!updated };
		}),
} satisfies TRPCRouterRecord;
