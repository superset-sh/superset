import { db } from "@superset/db/client";
import { mobilePairingSessions, voiceCommands } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../../trpc";

// 5 minutes TTL for pairing tokens
const PAIRING_TOKEN_TTL_MS = 5 * 60 * 1000;

export const mobileRouter = {
	// Create a pairing session (called by desktop)
	createPairingSession: protectedProcedure
		.input(
			z.object({
				desktopInstanceId: z.string(),
				activeWorkspaceId: z.string().optional(),
				activeWorkspaceName: z.string().optional(),
				activeProjectPath: z.string().optional(),
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

			// Generate a cryptographically secure pairing token
			const pairingToken = crypto.randomUUID();
			const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_MS);

			const [createdSession] = await db
				.insert(mobilePairingSessions)
				.values({
					userId: ctx.session.user.id,
					organizationId,
					pairingToken,
					desktopInstanceId: input.desktopInstanceId,
					activeWorkspaceId: input.activeWorkspaceId,
					activeWorkspaceName: input.activeWorkspaceName,
					activeProjectPath: input.activeProjectPath,
					expiresAt,
				})
				.returning();

			if (!createdSession) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create pairing session",
				});
			}

			return {
				sessionId: createdSession.id,
				pairingToken: createdSession.pairingToken,
				expiresAt: createdSession.expiresAt,
			};
		}),

	// Validate pairing token (called by mobile after scanning QR)
	// NOTE: Using publicProcedure for testing via ngrok. In production, this should
	// use protectedProcedure and verify the userId matches.
	validatePairingToken: publicProcedure
		.input(z.object({ pairingToken: z.string() }))
		.mutation(async ({ input }) => {
			const [session] = await db
				.select()
				.from(mobilePairingSessions)
				.where(
					and(
						eq(mobilePairingSessions.pairingToken, input.pairingToken),
						eq(mobilePairingSessions.status, "pending"),
						gt(mobilePairingSessions.expiresAt, new Date()),
					),
				)
				.limit(1);

			if (!session) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Invalid or expired pairing token",
				});
			}

			// Mark as paired
			const [updatedSession] = await db
				.update(mobilePairingSessions)
				.set({
					status: "paired",
					pairedAt: new Date(),
				})
				.where(eq(mobilePairingSessions.id, session.id))
				.returning();

			if (!updatedSession) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update pairing session",
				});
			}

			return {
				sessionId: updatedSession.id,
				workspaceId: updatedSession.activeWorkspaceId,
				workspaceName: updatedSession.activeWorkspaceName,
				projectPath: updatedSession.activeProjectPath,
				desktopInstanceId: updatedSession.desktopInstanceId,
			};
		}),

	// Get active pairing sessions for the current user
	getActiveSessions: protectedProcedure.query(async ({ ctx }) => {
		const sessions = await db
			.select()
			.from(mobilePairingSessions)
			.where(
				and(
					eq(mobilePairingSessions.userId, ctx.session.user.id),
					eq(mobilePairingSessions.status, "paired"),
				),
			)
			.orderBy(desc(mobilePairingSessions.pairedAt));

		return sessions.map((s) => ({
			id: s.id,
			workspaceId: s.activeWorkspaceId,
			workspaceName: s.activeWorkspaceName,
			projectPath: s.activeProjectPath,
			desktopInstanceId: s.desktopInstanceId,
			pairedAt: s.pairedAt,
		}));
	}),

	// Revoke a pairing session
	revokeSession: protectedProcedure
		.input(z.object({ sessionId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const [session] = await db
				.update(mobilePairingSessions)
				.set({ status: "revoked" })
				.where(
					and(
						eq(mobilePairingSessions.id, input.sessionId),
						eq(mobilePairingSessions.userId, ctx.session.user.id),
					),
				)
				.returning();

			if (!session) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Session not found",
				});
			}

			return { success: true };
		}),

	// Send a voice command (called by mobile)
	sendVoiceCommand: protectedProcedure
		.input(
			z.object({
				sessionId: z.string().uuid(),
				transcript: z.string(),
				targetType: z.enum(["terminal", "claude", "task"]),
				targetId: z.string().optional(),
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

			// Verify session belongs to user
			const [session] = await db
				.select()
				.from(mobilePairingSessions)
				.where(
					and(
						eq(mobilePairingSessions.id, input.sessionId),
						eq(mobilePairingSessions.userId, ctx.session.user.id),
						eq(mobilePairingSessions.status, "paired"),
					),
				)
				.limit(1);

			if (!session) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Session not found or not paired",
				});
			}

			// Record the voice command
			const [command] = await db
				.insert(voiceCommands)
				.values({
					userId: ctx.session.user.id,
					organizationId,
					pairingSessionId: input.sessionId,
					transcript: input.transcript,
					targetType: input.targetType,
					targetId: input.targetId,
					status: "pending",
				})
				.returning();

			if (!command) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create voice command",
				});
			}

			// The actual command execution will be handled by the WebSocket relay
			// For now, return the command ID for tracking
			return {
				commandId: command.id,
				status: command.status,
			};
		}),

	// Get voice command history
	getVoiceCommandHistory: protectedProcedure
		.input(
			z.object({
				sessionId: z.string().uuid().optional(),
				limit: z.number().min(1).max(100).default(50),
			}),
		)
		.query(async ({ ctx, input }) => {
			const conditions = [eq(voiceCommands.userId, ctx.session.user.id)];

			if (input.sessionId) {
				conditions.push(eq(voiceCommands.pairingSessionId, input.sessionId));
			}

			const commands = await db
				.select()
				.from(voiceCommands)
				.where(and(...conditions))
				.orderBy(desc(voiceCommands.createdAt))
				.limit(input.limit);

			return commands;
		}),
};
