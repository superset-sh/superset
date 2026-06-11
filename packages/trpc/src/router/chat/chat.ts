import { db, dbWs } from "@superset/db/client";
import { chatMessages, chatSessions } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { uploadChatAttachment } from "./utils/upload-chat-attachment";

const AVAILABLE_MODELS = [
	{
		id: "claude-code-default",
		name: "Claude Code Default",
		provider: "Claude Code",
	},
	{
		id: "gpt-5.5(xhigh)",
		name: "gpt-5.5 (xhigh)",
		provider: "Claude Code",
	},
	{
		id: "gpt-5.5",
		name: "gpt-5.5",
		provider: "Claude Code",
	},
];

const chatMessageContentSchema = z.array(
	z.discriminatedUnion("type", [
		z.object({
			type: z.literal("text"),
			text: z.string(),
		}),
		z.object({
			type: z.literal("reasoning"),
			text: z.string(),
		}),
		z.object({
			type: z.literal("thinking"),
			thinking: z.string(),
		}),
		z.object({
			type: z.literal("tool_call"),
			id: z.string(),
			name: z.string(),
			args: z.record(z.string(), z.unknown()),
		}),
		z.object({
			type: z.literal("tool_result"),
			id: z.string(),
			name: z.string(),
			result: z.unknown(),
			isError: z.boolean().optional(),
		}),
		z.object({
			type: z.literal("permission_requested"),
			id: z.string(),
			toolCallId: z.string(),
			toolName: z.string(),
			args: z.record(z.string(), z.unknown()),
			title: z.string().optional(),
			displayName: z.string().optional(),
			description: z.string().optional(),
			decisionReason: z.string().optional(),
			blockedPath: z.string().optional(),
		}),
		z.object({
			type: z.literal("permission_resolved"),
			id: z.string(),
			requestId: z.string(),
			toolCallId: z.string(),
			toolName: z.string(),
			decision: z.enum([
				"approve",
				"decline",
				"always_allow_category",
				"denied",
			]),
			message: z.string().optional(),
		}),
		z.object({
			type: z.literal("tool_progress"),
			id: z.string(),
			toolCallId: z.string(),
			toolName: z.string(),
			elapsedTimeSeconds: z.number().optional(),
			status: z
				.enum(["running", "completed", "failed", "cancelled"])
				.optional(),
			summary: z.string().optional(),
			taskId: z.string().optional(),
		}),
		z.object({
			type: z.literal("subagent_event"),
			id: z.string(),
			taskId: z.string(),
			toolCallId: z.string().optional(),
			status: z.enum([
				"started",
				"progress",
				"updated",
				"completed",
				"failed",
				"stopped",
			]),
			description: z.string().optional(),
			subagentType: z.string().optional(),
			summary: z.string().optional(),
			lastToolName: z.string().optional(),
			usage: z
				.object({
					totalTokens: z.number().optional(),
					toolUses: z.number().optional(),
					durationMs: z.number().optional(),
				})
				.optional(),
		}),
		z.object({
			type: z.literal("mode_changed"),
			id: z.string(),
			provider: z.string(),
			mode: z.string(),
			label: z.string().optional(),
		}),
		z.object({
			type: z.literal("model_changed"),
			id: z.string(),
			provider: z.string(),
			model: z.string(),
			label: z.string().optional(),
		}),
		z.object({
			type: z.literal("context_attachment"),
			id: z.string(),
			kind: z.enum(["file", "image", "url", "tool_artifact"]),
			title: z.string(),
			url: z.string().optional(),
			mediaType: z.string().optional(),
			filename: z.string().optional(),
			sourceToolCallId: z.string().optional(),
		}),
		z.object({
			type: z.literal("branch_marker"),
			id: z.string(),
			label: z.string(),
			branchId: z.string().optional(),
			status: z.enum(["placeholder", "available", "active"]),
		}),
		z.object({
			type: z.literal("file"),
			data: z.string(),
			mediaType: z.string(),
			filename: z.string().optional(),
		}),
		z.object({
			type: z.literal("image"),
			data: z.string(),
			mimeType: z.string(),
		}),
	]),
);

const chatMessageSelect = {
	id: chatMessages.id,
	role: chatMessages.role,
	content: chatMessages.content,
	stopReason: chatMessages.stopReason,
	errorMessage: chatMessages.errorMessage,
	createdAt: chatMessages.createdAt,
};

async function getOwnedChatSession(args: {
	sessionId: string;
	organizationId: string;
	userId: string;
}) {
	const [sessionRecord] = await db
		.select({
			id: chatSessions.id,
			organizationId: chatSessions.organizationId,
			createdBy: chatSessions.createdBy,
		})
		.from(chatSessions)
		.where(
			and(
				eq(chatSessions.id, args.sessionId),
				eq(chatSessions.organizationId, args.organizationId),
				eq(chatSessions.createdBy, args.userId),
			),
		)
		.limit(1);

	if (!sessionRecord) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Chat session not found",
		});
	}

	return sessionRecord;
}

export const chatRouter = {
	getModels: protectedProcedure.query(() => {
		return { models: AVAILABLE_MODELS };
	}),

	createSession: protectedProcedure
		.input(
			z.object({
				sessionId: z.uuid(),
				v2WorkspaceId: z.uuid().nullish(),
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

			const result = await dbWs.transaction(async (tx) => {
				const [inserted] = await tx
					.insert(chatSessions)
					.values({
						id: input.sessionId,
						organizationId,
						createdBy: ctx.session.user.id,
						v2WorkspaceId: input.v2WorkspaceId ?? null,
					})
					.onConflictDoNothing()
					.returning({ id: chatSessions.id });

				if (!inserted) {
					return { txid: null };
				}

				const txid = await getCurrentTxid(tx);
				return { txid };
			});

			return {
				sessionId: input.sessionId,
				txid: result.txid,
			};
		}),

	updateSession: protectedProcedure
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
						eq(chatSessions.createdBy, ctx.session.user.id),
					),
				)
				.returning({ id: chatSessions.id });

			return { updated: !!updated };
		}),

	listMessages: protectedProcedure
		.input(z.object({ sessionId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No active organization selected",
				});
			}

			await getOwnedChatSession({
				sessionId: input.sessionId,
				organizationId,
				userId: ctx.session.user.id,
			});

			return db
				.select(chatMessageSelect)
				.from(chatMessages)
				.where(eq(chatMessages.chatSessionId, input.sessionId))
				.orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));
		}),

	appendMessage: protectedProcedure
		.input(
			z.object({
				id: z.string().min(1),
				sessionId: z.uuid(),
				role: z.enum(["user", "assistant"]),
				content: chatMessageContentSchema,
				stopReason: z.enum(["end_turn", "error", "aborted"]).optional(),
				errorMessage: z.string().optional(),
				createdAt: z.date().optional(),
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

			await getOwnedChatSession({
				sessionId: input.sessionId,
				organizationId,
				userId: ctx.session.user.id,
			});

			const result = await dbWs.transaction(async (tx) => {
				const [inserted] = await tx
					.insert(chatMessages)
					.values({
						id: input.id,
						chatSessionId: input.sessionId,
						organizationId,
						createdBy: ctx.session.user.id,
						role: input.role,
						content: input.content,
						stopReason: input.stopReason,
						errorMessage: input.errorMessage,
						createdAt: input.createdAt ?? new Date(),
					})
					.onConflictDoNothing()
					.returning({ id: chatMessages.id });

				await tx
					.update(chatSessions)
					.set({ lastActiveAt: new Date() })
					.where(
						and(
							eq(chatSessions.id, input.sessionId),
							eq(chatSessions.organizationId, organizationId),
							eq(chatSessions.createdBy, ctx.session.user.id),
						),
					);

				if (!inserted) return { txid: null };
				const txid = await getCurrentTxid(tx);
				return { txid };
			});

			return { messageId: input.id, txid: result.txid };
		}),

	deleteMessagesFrom: protectedProcedure
		.input(z.object({ sessionId: z.uuid(), messageId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No active organization selected",
				});
			}

			await getOwnedChatSession({
				sessionId: input.sessionId,
				organizationId,
				userId: ctx.session.user.id,
			});

			const [targetMessage] = await db
				.select({ createdAt: chatMessages.createdAt })
				.from(chatMessages)
				.where(
					and(
						eq(chatMessages.chatSessionId, input.sessionId),
						eq(chatMessages.id, input.messageId),
						eq(chatMessages.organizationId, organizationId),
						eq(chatMessages.createdBy, ctx.session.user.id),
					),
				)
				.limit(1);

			if (!targetMessage) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat message not found",
				});
			}

			const result = await dbWs.transaction(async (tx) => {
				await tx
					.delete(chatMessages)
					.where(
						and(
							eq(chatMessages.chatSessionId, input.sessionId),
							eq(chatMessages.organizationId, organizationId),
							eq(chatMessages.createdBy, ctx.session.user.id),
							gte(chatMessages.createdAt, targetMessage.createdAt),
						),
					);

				await tx
					.update(chatSessions)
					.set({ lastActiveAt: new Date() })
					.where(
						and(
							eq(chatSessions.id, input.sessionId),
							eq(chatSessions.organizationId, organizationId),
							eq(chatSessions.createdBy, ctx.session.user.id),
						),
					);

				const txid = await getCurrentTxid(tx);
				return { txid };
			});

			return { txid: result.txid };
		}),

	deleteSession: protectedProcedure
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
							eq(chatSessions.createdBy, ctx.session.user.id),
						),
					)
					.returning({ id: chatSessions.id });

				if (!deleted) return { deleted, txid: null };
				const txid = await getCurrentTxid(tx);

				return { deleted, txid };
			});
			const { deleted, txid } = result;

			return { deleted: !!deleted, txid };
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
			const organizationId = ctx.activeOrganizationId;

			if (!organizationId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No active organization selected",
				});
			}

			const [sessionRecord] = await db
				.select({
					id: chatSessions.id,
					organizationId: chatSessions.organizationId,
				})
				.from(chatSessions)
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, organizationId),
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

			const result = await uploadChatAttachment({
				...input,
				userId: ctx.session.user.id,
				organizationId: sessionRecord.organizationId,
			});
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
