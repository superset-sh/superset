import { db, dbWs } from "@superset/db/client";
import {
	cloudWorkspaceSessions,
	cloudWorkspaces,
	repositories,
} from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";

import { getCloudProvider } from "../../lib/cloud-providers";
import { protectedProcedure } from "../../trpc";
import {
	cloudWorkspaceIdSchema,
	createCloudWorkspaceSchema,
	joinSessionSchema,
	listCloudWorkspacesSchema,
	sessionIdSchema,
	updateCloudWorkspaceSchema,
} from "./schema";

export const cloudWorkspaceRouter = {
	// ============ QUERIES ============

	/**
	 * List all cloud workspaces for the user's active organization
	 */
	list: protectedProcedure
		.input(listCloudWorkspacesSchema)
		.query(async ({ ctx }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				return [];
			}
			return db
				.select()
				.from(cloudWorkspaces)
				.where(eq(cloudWorkspaces.organizationId, organizationId))
				.orderBy(desc(cloudWorkspaces.createdAt));
		}),

	/**
	 * Get a single cloud workspace by ID with relations
	 */
	get: protectedProcedure
		.input(cloudWorkspaceIdSchema)
		.query(async ({ input }) => {
			const [workspace] = await db
				.select()
				.from(cloudWorkspaces)
				.where(eq(cloudWorkspaces.id, input.workspaceId))
				.limit(1);

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud workspace not found",
				});
			}

			return workspace;
		}),

	/**
	 * Get SSH credentials for connecting to a cloud workspace
	 */
	getSSHCredentials: protectedProcedure
		.input(cloudWorkspaceIdSchema)
		.query(async ({ input }) => {
			const [workspace] = await db
				.select()
				.from(cloudWorkspaces)
				.where(eq(cloudWorkspaces.id, input.workspaceId))
				.limit(1);

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud workspace not found",
				});
			}

			if (workspace.status !== "running") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Cannot get SSH credentials for workspace in "${workspace.status}" state. Workspace must be running.`,
				});
			}

			if (!workspace.providerVmId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Workspace has no VM ID. It may still be provisioning.",
				});
			}

			const provider = getCloudProvider(workspace.providerType);
			return provider.getSSHCredentials(workspace.providerVmId);
		}),

	/**
	 * Get active sessions for a workspace
	 */
	getSessions: protectedProcedure
		.input(cloudWorkspaceIdSchema)
		.query(async ({ input }) => {
			return db
				.select()
				.from(cloudWorkspaceSessions)
				.where(eq(cloudWorkspaceSessions.workspaceId, input.workspaceId));
		}),

	// ============ MUTATIONS ============

	/**
	 * Create a new cloud workspace
	 */
	create: protectedProcedure
		.input(createCloudWorkspaceSchema)
		.mutation(async ({ ctx, input }) => {
			// Get organization from session
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization. Please select an organization first.",
				});
			}

			// Get repository info for the repo URL
			const [repository] = await db
				.select()
				.from(repositories)
				.where(eq(repositories.id, input.repositoryId))
				.limit(1);

			if (!repository) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Repository not found",
				});
			}

			// Use provided branch or repository default branch
			const branch = input.branch ?? repository.defaultBranch;

			// Create workspace record in provisioning state
			const result = await dbWs.transaction(async (tx) => {
				const [workspace] = await tx
					.insert(cloudWorkspaces)
					.values({
						organizationId,
						repositoryId: input.repositoryId,
						creatorId: ctx.session.user.id,
						name: input.name,
						branch,
						providerType: input.providerType,
						status: "provisioning",
						autoStopMinutes: input.autoStopMinutes,
					})
					.returning();

				const txid = await getCurrentTxid(tx);
				return { workspace, txid };
			});

			// Start async provisioning
			if (result.workspace) {
				provisionWorkspaceAsync({
					workspaceId: result.workspace.id,
					repoUrl: repository.repoUrl,
					branch,
					workspaceName: input.name,
					providerType: input.providerType,
					autoStopMinutes: input.autoStopMinutes,
				});
			}

			return result;
		}),

	/**
	 * Update workspace settings
	 */
	update: protectedProcedure
		.input(updateCloudWorkspaceSchema)
		.mutation(async ({ input }) => {
			const { workspaceId, ...data } = input;

			const result = await dbWs.transaction(async (tx) => {
				const [workspace] = await tx
					.update(cloudWorkspaces)
					.set(data)
					.where(eq(cloudWorkspaces.id, workspaceId))
					.returning();

				const txid = await getCurrentTxid(tx);
				return { workspace, txid };
			});

			return result;
		}),

	/**
	 * Pause a running workspace
	 */
	pause: protectedProcedure
		.input(cloudWorkspaceIdSchema)
		.mutation(async ({ input }) => {
			const [workspace] = await db
				.select()
				.from(cloudWorkspaces)
				.where(eq(cloudWorkspaces.id, input.workspaceId))
				.limit(1);

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud workspace not found",
				});
			}

			if (workspace.status !== "running") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Cannot pause workspace in "${workspace.status}" state`,
				});
			}

			if (!workspace.providerVmId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Workspace has no VM ID",
				});
			}

			const provider = getCloudProvider(workspace.providerType);
			await provider.pauseVM(workspace.providerVmId);

			const result = await dbWs.transaction(async (tx) => {
				const [updated] = await tx
					.update(cloudWorkspaces)
					.set({ status: "paused" })
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
		.mutation(async ({ input }) => {
			const [workspace] = await db
				.select()
				.from(cloudWorkspaces)
				.where(eq(cloudWorkspaces.id, input.workspaceId))
				.limit(1);

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud workspace not found",
				});
			}

			if (workspace.status !== "paused" && workspace.status !== "stopped") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Cannot resume workspace in "${workspace.status}" state`,
				});
			}

			if (!workspace.providerVmId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Workspace has no VM ID",
				});
			}

			const provider = getCloudProvider(workspace.providerType);
			await provider.resumeVM(workspace.providerVmId);

			const result = await dbWs.transaction(async (tx) => {
				const [updated] = await tx
					.update(cloudWorkspaces)
					.set({ status: "running", lastActiveAt: new Date() })
					.where(eq(cloudWorkspaces.id, input.workspaceId))
					.returning();

				const txid = await getCurrentTxid(tx);
				return { workspace: updated, txid };
			});

			return result;
		}),

	/**
	 * Stop a workspace
	 */
	stop: protectedProcedure
		.input(cloudWorkspaceIdSchema)
		.mutation(async ({ input }) => {
			const [workspace] = await db
				.select()
				.from(cloudWorkspaces)
				.where(eq(cloudWorkspaces.id, input.workspaceId))
				.limit(1);

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud workspace not found",
				});
			}

			if (workspace.status !== "running" && workspace.status !== "paused") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Cannot stop workspace in "${workspace.status}" state`,
				});
			}

			if (!workspace.providerVmId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Workspace has no VM ID",
				});
			}

			const provider = getCloudProvider(workspace.providerType);
			await provider.stopVM(workspace.providerVmId);

			const result = await dbWs.transaction(async (tx) => {
				const [updated] = await tx
					.update(cloudWorkspaces)
					.set({ status: "stopped" })
					.where(eq(cloudWorkspaces.id, input.workspaceId))
					.returning();

				const txid = await getCurrentTxid(tx);
				return { workspace: updated, txid };
			});

			return result;
		}),

	/**
	 * Delete a workspace permanently
	 */
	delete: protectedProcedure
		.input(cloudWorkspaceIdSchema)
		.mutation(async ({ input }) => {
			const [workspace] = await db
				.select()
				.from(cloudWorkspaces)
				.where(eq(cloudWorkspaces.id, input.workspaceId))
				.limit(1);

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud workspace not found",
				});
			}

			// Delete VM from provider if it exists
			if (workspace.providerVmId) {
				try {
					const provider = getCloudProvider(workspace.providerType);
					await provider.deleteVM(workspace.providerVmId);
				} catch (error) {
					console.error(
						"[cloud-workspace] Failed to delete VM from provider:",
						error,
					);
					// Continue with database deletion even if provider deletion fails
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

	// ============ SESSION MANAGEMENT ============

	/**
	 * Join a workspace session (track connected clients)
	 */
	join: protectedProcedure
		.input(joinSessionSchema)
		.mutation(async ({ ctx, input }) => {
			const [workspace] = await db
				.select()
				.from(cloudWorkspaces)
				.where(eq(cloudWorkspaces.id, input.workspaceId))
				.limit(1);

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Cloud workspace not found",
				});
			}

			// Auto-resume if workspace is paused
			if (workspace.status === "paused" && workspace.providerVmId) {
				const provider = getCloudProvider(workspace.providerType);
				await provider.resumeVM(workspace.providerVmId);

				await dbWs
					.update(cloudWorkspaces)
					.set({ status: "running", lastActiveAt: new Date() })
					.where(eq(cloudWorkspaces.id, input.workspaceId));
			}

			const result = await dbWs.transaction(async (tx) => {
				const [session] = await tx
					.insert(cloudWorkspaceSessions)
					.values({
						workspaceId: input.workspaceId,
						userId: ctx.session.user.id,
						clientType: input.clientType,
					})
					.returning();

				// Update workspace last active
				await tx
					.update(cloudWorkspaces)
					.set({ lastActiveAt: new Date() })
					.where(eq(cloudWorkspaces.id, input.workspaceId));

				const txid = await getCurrentTxid(tx);
				return { session, txid };
			});

			return result;
		}),

	/**
	 * Leave a workspace session
	 */
	leave: protectedProcedure
		.input(sessionIdSchema)
		.mutation(async ({ input }) => {
			const result = await dbWs.transaction(async (tx) => {
				await tx
					.delete(cloudWorkspaceSessions)
					.where(eq(cloudWorkspaceSessions.id, input.sessionId));

				const txid = await getCurrentTxid(tx);
				return { txid };
			});

			return result;
		}),

	/**
	 * Send heartbeat to keep session alive
	 */
	heartbeat: protectedProcedure
		.input(sessionIdSchema)
		.mutation(async ({ input }) => {
			const result = await dbWs.transaction(async (tx) => {
				const [session] = await tx
					.update(cloudWorkspaceSessions)
					.set({ lastHeartbeatAt: new Date() })
					.where(eq(cloudWorkspaceSessions.id, input.sessionId))
					.returning();

				if (session) {
					// Also update workspace last active
					await tx
						.update(cloudWorkspaces)
						.set({ lastActiveAt: new Date() })
						.where(eq(cloudWorkspaces.id, session.workspaceId));
				}

				const txid = await getCurrentTxid(tx);
				return { session, txid };
			});

			return result;
		}),
} satisfies TRPCRouterRecord;

// ============ ASYNC HELPERS ============

/**
 * Provision a workspace asynchronously
 * This runs after the workspace record is created
 */
async function provisionWorkspaceAsync({
	workspaceId,
	repoUrl,
	branch,
	workspaceName,
	providerType,
	autoStopMinutes,
}: {
	workspaceId: string;
	repoUrl: string;
	branch: string;
	workspaceName: string;
	providerType: "freestyle" | "fly";
	autoStopMinutes: number;
}) {
	console.log(
		"[cloud-workspace] Starting async provisioning for:",
		workspaceId,
	);

	try {
		const provider = getCloudProvider(providerType);
		const { vmId, status } = await provider.createVM({
			repoUrl,
			branch,
			workspaceName,
			idleTimeoutSeconds: autoStopMinutes * 60,
		});

		console.log("[cloud-workspace] VM created:", vmId, "status:", status);

		// Update workspace with VM ID and running status
		await dbWs
			.update(cloudWorkspaces)
			.set({
				providerVmId: vmId,
				status: "running",
				lastActiveAt: new Date(),
			})
			.where(eq(cloudWorkspaces.id, workspaceId));

		console.log("[cloud-workspace] Provisioning complete for:", workspaceId);
	} catch (error) {
		console.error("[cloud-workspace] Provisioning failed:", error);

		// Update workspace with error status
		await dbWs
			.update(cloudWorkspaces)
			.set({
				status: "error",
				statusMessage:
					error instanceof Error ? error.message : "Provisioning failed",
			})
			.where(eq(cloudWorkspaces.id, workspaceId));
	}
}
