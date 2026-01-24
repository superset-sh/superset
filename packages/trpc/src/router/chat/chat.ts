import { db, dbWs } from "@superset/db/client";
import {
	chatMessages,
	chatParticipants,
	chatSessions,
	users,
} from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";

export const chatRouter = {
	// Create a new chat session
	createSession: protectedProcedure
		.input(
			z.object({
				repositoryId: z.string().uuid().optional(),
				workspaceId: z.string().optional(),
				title: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}

			const result = await dbWs.transaction(async (tx) => {
				const [session] = await tx
					.insert(chatSessions)
					.values({
						organizationId,
						repositoryId: input.repositoryId,
						workspaceId: input.workspaceId,
						title: input.title ?? "New Chat",
						createdById: ctx.session.user.id,
					})
					.returning();

				if (!session) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create chat session",
					});
				}

				// Add creator as owner participant
				await tx.insert(chatParticipants).values({
					sessionId: session.id,
					userId: ctx.session.user.id,
					role: "owner",
				});

				const txid = await getCurrentTxid(tx);

				return { session, txid };
			});

			return result;
		}),

	// Get a specific session
	getSession: protectedProcedure
		.input(z.object({ sessionId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}

			const [session] = await db
				.select()
				.from(chatSessions)
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, organizationId),
						isNull(chatSessions.archivedAt),
					),
				)
				.limit(1);

			if (!session) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat session not found",
				});
			}

			return session;
		}),

	// List sessions for the organization
	listSessions: protectedProcedure
		.input(
			z.object({
				repositoryId: z.string().uuid().optional(),
				workspaceId: z.string().optional(),
				limit: z.number().min(1).max(100).optional().default(50),
			}),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}

			const creator = alias(users, "creator");

			const conditions = [
				eq(chatSessions.organizationId, organizationId),
				isNull(chatSessions.archivedAt),
			];

			if (input.repositoryId) {
				conditions.push(eq(chatSessions.repositoryId, input.repositoryId));
			}

			if (input.workspaceId) {
				conditions.push(eq(chatSessions.workspaceId, input.workspaceId));
			}

			return db
				.select({
					session: chatSessions,
					creator: {
						id: creator.id,
						name: creator.name,
						image: creator.image,
					},
				})
				.from(chatSessions)
				.leftJoin(creator, eq(chatSessions.createdById, creator.id))
				.where(and(...conditions))
				.orderBy(desc(chatSessions.updatedAt))
				.limit(input.limit);
		}),

	// Send a user message (triggers Claude on desktop via Electric subscription)
	sendMessage: protectedProcedure
		.input(
			z.object({
				sessionId: z.string().uuid(),
				content: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}

			// Verify session exists and user has access
			const [session] = await db
				.select()
				.from(chatSessions)
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, organizationId),
						isNull(chatSessions.archivedAt),
					),
				)
				.limit(1);

			if (!session) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat session not found",
				});
			}

			const result = await dbWs.transaction(async (tx) => {
				const [message] = await tx
					.insert(chatMessages)
					.values({
						sessionId: input.sessionId,
						organizationId,
						role: "user",
						content: input.content,
						createdById: ctx.session.user.id,
					})
					.returning();

				// Update session's updatedAt
				await tx
					.update(chatSessions)
					.set({ updatedAt: new Date() })
					.where(eq(chatSessions.id, input.sessionId));

				const txid = await getCurrentTxid(tx);

				return { message, txid };
			});

			return result;
		}),

	// Save assistant message (called by desktop after Claude completes)
	saveAssistantMessage: protectedProcedure
		.input(
			z.object({
				sessionId: z.string().uuid(),
				content: z.string(),
				toolCalls: z.any().optional(),
				inputTokens: z.number().optional(),
				outputTokens: z.number().optional(),
				claudeSessionId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}

			// Verify session exists
			const [session] = await db
				.select()
				.from(chatSessions)
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, organizationId),
					),
				)
				.limit(1);

			if (!session) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat session not found",
				});
			}

			const result = await dbWs.transaction(async (tx) => {
				const [message] = await tx
					.insert(chatMessages)
					.values({
						sessionId: input.sessionId,
						organizationId,
						role: "assistant",
						content: input.content,
						toolCalls: input.toolCalls,
						inputTokens: input.inputTokens,
						outputTokens: input.outputTokens,
						createdById: ctx.session.user.id, // Desktop user who ran Claude
					})
					.returning();

				// Update session with Claude session ID for resume capability
				if (input.claudeSessionId) {
					await tx
						.update(chatSessions)
						.set({
							claudeSessionId: input.claudeSessionId,
							updatedAt: new Date(),
						})
						.where(eq(chatSessions.id, input.sessionId));
				} else {
					await tx
						.update(chatSessions)
						.set({ updatedAt: new Date() })
						.where(eq(chatSessions.id, input.sessionId));
				}

				const txid = await getCurrentTxid(tx);

				return { message, txid };
			});

			return result;
		}),

	// Get messages for a session
	getMessages: protectedProcedure
		.input(
			z.object({
				sessionId: z.string().uuid(),
				limit: z.number().min(1).max(500).optional().default(100),
			}),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}

			// Verify session access
			const [session] = await db
				.select()
				.from(chatSessions)
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, organizationId),
					),
				)
				.limit(1);

			if (!session) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat session not found",
				});
			}

			const creator = alias(users, "creator");

			return db
				.select({
					message: chatMessages,
					creator: {
						id: creator.id,
						name: creator.name,
						image: creator.image,
					},
				})
				.from(chatMessages)
				.leftJoin(creator, eq(chatMessages.createdById, creator.id))
				.where(eq(chatMessages.sessionId, input.sessionId))
				.orderBy(chatMessages.createdAt)
				.limit(input.limit);
		}),

	// Archive a session
	archiveSession: protectedProcedure
		.input(z.object({ sessionId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}

			const result = await dbWs.transaction(async (tx) => {
				const [session] = await tx
					.update(chatSessions)
					.set({ archivedAt: new Date() })
					.where(
						and(
							eq(chatSessions.id, input.sessionId),
							eq(chatSessions.organizationId, organizationId),
						),
					)
					.returning();

				if (!session) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Chat session not found",
					});
				}

				const txid = await getCurrentTxid(tx);

				return { session, txid };
			});

			return result;
		}),

	// Update session (title, cwd, etc.)
	updateSession: protectedProcedure
		.input(
			z.object({
				sessionId: z.string().uuid(),
				title: z.string().optional(),
				cwd: z.string().optional(),
				claudeSessionId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}

			const { sessionId, ...data } = input;

			const result = await dbWs.transaction(async (tx) => {
				const [session] = await tx
					.update(chatSessions)
					.set(data)
					.where(
						and(
							eq(chatSessions.id, sessionId),
							eq(chatSessions.organizationId, organizationId),
						),
					)
					.returning();

				if (!session) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Chat session not found",
					});
				}

				const txid = await getCurrentTxid(tx);

				return { session, txid };
			});

			return result;
		}),

	// Get participants for a session
	getParticipants: protectedProcedure
		.input(z.object({ sessionId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}

			// Verify session access
			const [session] = await db
				.select()
				.from(chatSessions)
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, organizationId),
					),
				)
				.limit(1);

			if (!session) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat session not found",
				});
			}

			return db
				.select({
					participant: chatParticipants,
					user: {
						id: users.id,
						name: users.name,
						image: users.image,
						email: users.email,
					},
				})
				.from(chatParticipants)
				.leftJoin(users, eq(chatParticipants.userId, users.id))
				.where(eq(chatParticipants.sessionId, input.sessionId));
		}),

	// Add participant to session
	addParticipant: protectedProcedure
		.input(
			z.object({
				sessionId: z.string().uuid(),
				userId: z.string().uuid(),
				role: z.enum(["editor", "viewer"]).optional().default("viewer"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}

			// Verify session exists and current user has owner/editor access
			const [session] = await db
				.select()
				.from(chatSessions)
				.where(
					and(
						eq(chatSessions.id, input.sessionId),
						eq(chatSessions.organizationId, organizationId),
					),
				)
				.limit(1);

			if (!session) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat session not found",
				});
			}

			const result = await dbWs.transaction(async (tx) => {
				const [participant] = await tx
					.insert(chatParticipants)
					.values({
						sessionId: input.sessionId,
						userId: input.userId,
						role: input.role,
					})
					.onConflictDoUpdate({
						target: [chatParticipants.sessionId, chatParticipants.userId],
						set: { role: input.role },
					})
					.returning();

				const txid = await getCurrentTxid(tx);

				return { participant, txid };
			});

			return result;
		}),
} satisfies TRPCRouterRecord;
