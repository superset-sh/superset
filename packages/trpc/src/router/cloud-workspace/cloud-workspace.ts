import { db, dbWs } from "@superset/db/client";
import {
	cloudWorkspaces,
	cloudWorkspaceSessions,
	repositories,
} from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getCloudProvider } from "../../lib/cloud-providers";
import { protectedProcedure } from "../../trpc";
import { verifyOrgMembership } from "../integration/linear/utils";
import {
	cloudWorkspaceIdSchema,
	createCloudWorkspaceSchema,
	heartbeatSchema,
	joinSessionSchema,
	leaveSessionSchema,
	updateCloudWorkspaceSchema,
} from "./schema";

/**
 * Helper to get workspace and verify org membership
 */
async function getWorkspaceWithAuth(userId: string, workspaceId: string) {
	const workspace = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, workspaceId),
	});

	if (!workspace) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Cloud workspace not found",
		});
	}

	await verifyOrgMembership(userId, workspace.organizationId);

	return workspace;
}

/**
 * Provision VM asynchronously (fire and forget)
 */
async function provisionVM(
	workspaceId: string,
	repoUrl: string,
	input: z.infer<typeof createCloudWorkspaceSchema>,
) {
	try {
		const provider = getCloudProvider(input.providerType);
		const result = await provider.createVM({
			repoUrl,
			branch: input.branch,
			workspaceName: input.name,
			idleTimeoutSeconds: input.autoStopMinutes * 60,
		});

		await db
			.update(cloudWorkspaces)
			.set({
				providerVmId: result.vmId,
				status: "running",
				lastActiveAt: new Date(),
			})
			.where(eq(cloudWorkspaces.id, workspaceId));

		console.log(
			`[cloud-workspace/provision] Successfully provisioned VM for workspace ${workspaceId}`,
		);
	} catch (error) {
		console.error("[cloud-workspace/provision] Failed to provision VM:", error);
		await db
			.update(cloudWorkspaces)
			.set({
				status: "error",
				statusMessage:
					error instanceof Error ? error.message : "Unknown provisioning error",
			})
			.where(eq(cloudWorkspaces.id, workspaceId));
	}
}

export const cloudWorkspaceRouter = {
	// ============================================================
	// Query Procedures
	// ============================================================

	/**
	 * List cloud workspaces for an organization
	 */
	list: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			return db.query.cloudWorkspaces.findMany({
				where: eq(cloudWorkspaces.organizationId, input.organizationId),
				orderBy: desc(cloudWorkspaces.createdAt),
				with: {
					repository: true,
					creator: true,
				},
			});
		}),

	/**
	 * Get a single cloud workspace by ID
	 */
	get: protectedProcedure
		.input(cloudWorkspaceIdSchema)
		.query(async ({ ctx, input }) => {
			const workspace = await db.query.cloudWorkspaces.findFirst({
				where: eq(cloudWorkspaces.id, input.workspaceId),
				with: {
					repository: true,
					creator: true,
					organization: true,
				},
			});

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud workspace not found",
				});
			}

			await verifyOrgMembership(ctx.session.user.id, workspace.organizationId);

			return workspace;
		}),

	/**
	 * Get SSH credentials for a running workspace
	 */
	getSSHCredentials: protectedProcedure
		.input(cloudWorkspaceIdSchema)
		.query(async ({ ctx, input }) => {
			const workspace = await getWorkspaceWithAuth(
				ctx.session.user.id,
				input.workspaceId,
			);

			if (workspace.status !== "running") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: `Workspace is ${workspace.status}, must be running to get SSH credentials`,
				});
			}

			if (!workspace.providerVmId) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace does not have a VM assigned yet",
				});
			}

			const provider = getCloudProvider(workspace.providerType);
			return provider.getSSHCredentials(workspace.providerVmId);
		}),

	/**
	 * Get active sessions for a workspace
	 */
	getActiveSessions: protectedProcedure
		.input(cloudWorkspaceIdSchema)
		.query(async ({ ctx, input }) => {
			await getWorkspaceWithAuth(ctx.session.user.id, input.workspaceId);

			return db.query.cloudWorkspaceSessions.findMany({
				where: eq(cloudWorkspaceSessions.workspaceId, input.workspaceId),
				with: {
					user: true,
				},
			});
		}),

	// ============================================================
	// Mutation Procedures - CRUD
	// ============================================================

	/**
	 * Create a new cloud workspace
	 */
	create: protectedProcedure
		.input(createCloudWorkspaceSchema)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			// Verify repository exists
			const repository = await db.query.repositories.findFirst({
				where: eq(repositories.id, input.repositoryId),
			});

			if (!repository) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Repository not found",
				});
			}

			const result = await dbWs.transaction(async (tx) => {
				const [workspace] = await tx
					.insert(cloudWorkspaces)
					.values({
						...input,
						creatorId: ctx.session.user.id,
						status: "provisioning",
					})
					.returning();

				const txid = await getCurrentTxid(tx);
				return { workspace, txid };
			});

			// Start async VM provisioning (fire and forget)
			if (result.workspace) {
				void provisionVM(result.workspace.id, repository.repoUrl, input);
			}

			return result;
		}),

	/**
	 * Update cloud workspace settings
	 */
	update: protectedProcedure
		.input(updateCloudWorkspaceSchema)
		.mutation(async ({ ctx, input }) => {
			const { id, ...data } = input;
			await getWorkspaceWithAuth(ctx.session.user.id, id);

			const result = await dbWs.transaction(async (tx) => {
				const [workspace] = await tx
					.update(cloudWorkspaces)
					.set(data)
					.where(eq(cloudWorkspaces.id, id))
					.returning();

				const txid = await getCurrentTxid(tx);
				return { workspace, txid };
			});

			return result;
		}),

	// ============================================================
	// Mutation Procedures - Lifecycle
	// ============================================================

	/**
	 * Pause a running workspace
	 */
	pause: protectedProcedure
		.input(cloudWorkspaceIdSchema)
		.mutation(async ({ ctx, input }) => {
			const workspace = await getWorkspaceWithAuth(
				ctx.session.user.id,
				input.workspaceId,
			);

			if (workspace.status !== "running") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: `Cannot pause workspace in ${workspace.status} state`,
				});
			}

			if (!workspace.providerVmId) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace does not have a VM assigned",
				});
			}

			const provider = getCloudProvider(workspace.providerType);
			const status = await provider.pauseVM(workspace.providerVmId);

			const result = await dbWs.transaction(async (tx) => {
				const [updated] = await tx
					.update(cloudWorkspaces)
					.set({
						status: status.status,
						statusMessage: status.message,
					})
					.where(eq(cloudWorkspaces.id, input.workspaceId))
					.returning();

				const txid = await getCurrentTxid(tx);
				return { workspace: updated, txid };
			});

			return result;
		}),

	/**
	 * Resume a paused workspace
	 */
	resume: protectedProcedure
		.input(cloudWorkspaceIdSchema)
		.mutation(async ({ ctx, input }) => {
			const workspace = await getWorkspaceWithAuth(
				ctx.session.user.id,
				input.workspaceId,
			);

			if (workspace.status !== "paused") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: `Cannot resume workspace in ${workspace.status} state`,
				});
			}

			if (!workspace.providerVmId) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace does not have a VM assigned",
				});
			}

			const provider = getCloudProvider(workspace.providerType);
			const status = await provider.resumeVM(workspace.providerVmId);

			const result = await dbWs.transaction(async (tx) => {
				const [updated] = await tx
					.update(cloudWorkspaces)
					.set({
						status: status.status,
						statusMessage: status.message,
						lastActiveAt: new Date(),
					})
					.where(eq(cloudWorkspaces.id, input.workspaceId))
					.returning();

				const txid = await getCurrentTxid(tx);
				return { workspace: updated, txid };
			});

			return result;
		}),

	/**
	 * Stop a running workspace
	 */
	stop: protectedProcedure
		.input(cloudWorkspaceIdSchema)
		.mutation(async ({ ctx, input }) => {
			const workspace = await getWorkspaceWithAuth(
				ctx.session.user.id,
				input.workspaceId,
			);

			if (workspace.status !== "running" && workspace.status !== "paused") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: `Cannot stop workspace in ${workspace.status} state`,
				});
			}

			if (!workspace.providerVmId) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Workspace does not have a VM assigned",
				});
			}

			const provider = getCloudProvider(workspace.providerType);
			const status = await provider.stopVM(workspace.providerVmId);

			const result = await dbWs.transaction(async (tx) => {
				const [updated] = await tx
					.update(cloudWorkspaces)
					.set({
						status: status.status,
						statusMessage: status.message,
					})
					.where(eq(cloudWorkspaces.id, input.workspaceId))
					.returning();

				const txid = await getCurrentTxid(tx);
				return { workspace: updated, txid };
			});

			return result;
		}),

	/**
	 * Delete a cloud workspace permanently
	 */
	delete: protectedProcedure
		.input(cloudWorkspaceIdSchema)
		.mutation(async ({ ctx, input }) => {
			const workspace = await getWorkspaceWithAuth(
				ctx.session.user.id,
				input.workspaceId,
			);

			// Delete VM from provider if it exists
			if (workspace.providerVmId) {
				try {
					const provider = getCloudProvider(workspace.providerType);
					await provider.deleteVM(workspace.providerVmId);
				} catch (error) {
					console.error(
						"[cloud-workspace/delete] Failed to delete VM from provider:",
						error,
					);
					// Continue with DB deletion even if provider deletion fails
				}
			}

			const result = await dbWs.transaction(async (tx) => {
				await tx
					.delete(cloudWorkspaces)
					.where(eq(cloudWorkspaces.id, input.workspaceId));

				const txid = await getCurrentTxid(tx);
				return { txid };
			});

			return result;
		}),

	// ============================================================
	// Mutation Procedures - Session Management
	// ============================================================

	/**
	 * Join a workspace session (auto-resumes if paused)
	 */
	join: protectedProcedure
		.input(joinSessionSchema)
		.mutation(async ({ ctx, input }) => {
			const workspace = await getWorkspaceWithAuth(
				ctx.session.user.id,
				input.workspaceId,
			);

			// Auto-resume if paused
			if (workspace.status === "paused" && workspace.providerVmId) {
				try {
					const provider = getCloudProvider(workspace.providerType);
					await provider.resumeVM(workspace.providerVmId);
					await db
						.update(cloudWorkspaces)
						.set({
							status: "running",
							lastActiveAt: new Date(),
						})
						.where(eq(cloudWorkspaces.id, input.workspaceId));
				} catch (error) {
					console.error("[cloud-workspace/join] Failed to auto-resume:", error);
				}
			}

			// Create session
			const [session] = await db
				.insert(cloudWorkspaceSessions)
				.values({
					workspaceId: input.workspaceId,
					userId: ctx.session.user.id,
					clientType: input.clientType,
				})
				.returning();

			// Update last active
			await db
				.update(cloudWorkspaces)
				.set({ lastActiveAt: new Date() })
				.where(eq(cloudWorkspaces.id, input.workspaceId));

			return { session };
		}),

	/**
	 * Leave a workspace session
	 */
	leave: protectedProcedure
		.input(leaveSessionSchema)
		.mutation(async ({ input }) => {
			await db
				.delete(cloudWorkspaceSessions)
				.where(eq(cloudWorkspaceSessions.id, input.sessionId));

			return { success: true };
		}),

	/**
	 * Send heartbeat for a session
	 */
	heartbeat: protectedProcedure
		.input(heartbeatSchema)
		.mutation(async ({ input }) => {
			await db
				.update(cloudWorkspaceSessions)
				.set({ lastHeartbeatAt: new Date() })
				.where(eq(cloudWorkspaceSessions.id, input.sessionId));

			return { success: true };
		}),
} satisfies TRPCRouterRecord;
