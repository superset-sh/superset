import { db, dbWs } from "@superset/db/client";
import { v2WorkspaceTypeValues } from "@superset/db/enums";
import {
	tasks,
	v2Hosts,
	v2Projects,
	v2UsersHosts,
	v2Workspaces,
} from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { posthog } from "../../lib/analytics";
import { jwtProcedure, protectedProcedure } from "../../trpc";
import { requireActiveOrgId } from "../utils/active-org";
import {
	requireOrgResourceAccess,
	requireOrgScopedResource,
} from "../utils/org-resource-access";

const MAIN_WORKSPACE_DELETE_MESSAGE =
	"Main workspaces cannot be deleted through workspace delete. Remove them from the sidebar or remove the project from this host instead.";

async function getScopedProject(organizationId: string, projectId: string) {
	return requireOrgScopedResource(
		() =>
			dbWs.query.v2Projects.findFirst({
				columns: {
					id: true,
					organizationId: true,
				},
				where: eq(v2Projects.id, projectId),
			}),
		{
			code: "BAD_REQUEST",
			message: "Project not found in this organization",
			organizationId,
		},
	);
}

async function getScopedHost(organizationId: string, hostId: string) {
	return requireOrgScopedResource(
		() =>
			dbWs.query.v2Hosts.findFirst({
				columns: {
					machineId: true,
					organizationId: true,
				},
				where: and(
					eq(v2Hosts.organizationId, organizationId),
					eq(v2Hosts.machineId, hostId),
				),
			}),
		{
			code: "BAD_REQUEST",
			message: "Host not found in this organization",
			organizationId,
		},
	);
}

async function _getScopedWorkspace(
	organizationId: string,
	workspaceId: string,
) {
	return requireOrgScopedResource(
		() =>
			dbWs.query.v2Workspaces.findFirst({
				columns: {
					id: true,
					organizationId: true,
				},
				where: eq(v2Workspaces.id, workspaceId),
			}),
		{
			message: "Workspace not found in this organization",
			organizationId,
		},
	);
}

async function getWorkspaceAccess(
	userId: string,
	workspaceId: string,
	options?: {
		access?: "admin" | "member";
		organizationId?: string;
	},
) {
	return requireOrgResourceAccess(
		userId,
		() =>
			dbWs.query.v2Workspaces.findFirst({
				columns: {
					id: true,
					organizationId: true,
				},
				where: eq(v2Workspaces.id, workspaceId),
			}),
		{
			access: options?.access,
			message: "Workspace not found",
			organizationId: options?.organizationId,
		},
	);
}

export const v2WorkspaceRouter = {
	list: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				hostId: z.string().min(1).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}

			const rows = await db
				.select({
					id: v2Workspaces.id,
					name: v2Workspaces.name,
					branch: v2Workspaces.branch,
					projectId: v2Workspaces.projectId,
					projectName: v2Projects.name,
					hostId: v2Workspaces.hostId,
				})
				.from(v2Workspaces)
				.innerJoin(
					v2UsersHosts,
					and(
						eq(v2UsersHosts.organizationId, v2Workspaces.organizationId),
						eq(v2UsersHosts.hostId, v2Workspaces.hostId),
					),
				)
				.leftJoin(v2Projects, eq(v2Projects.id, v2Workspaces.projectId))
				.where(
					and(
						eq(v2Workspaces.organizationId, input.organizationId),
						eq(v2UsersHosts.userId, ctx.userId),
						input.hostId ? eq(v2Workspaces.hostId, input.hostId) : undefined,
					),
				);

			return rows.map((row) => ({
				id: row.id,
				name: row.name,
				branch: row.branch,
				projectId: row.projectId,
				projectName: row.projectName ?? "",
				hostId: row.hostId,
			}));
		}),

	create: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				projectId: z.string().uuid(),
				name: z.string().min(1),
				branch: z.string().min(1),
				hostId: z.string().min(1),
				type: z.enum(v2WorkspaceTypeValues).default("worktree"),
				taskId: z.string().uuid().optional(),
				id: z.string().uuid().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}

			const project = await getScopedProject(
				input.organizationId,
				input.projectId,
			);
			const host = await getScopedHost(input.organizationId, input.hostId);

			if (input.taskId) {
				const found = await dbWs.query.tasks.findFirst({
					columns: { id: true, organizationId: true },
					where: eq(tasks.id, input.taskId),
				});
				if (!found) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "taskId not found",
					});
				}
				if (found.organizationId !== input.organizationId) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "taskId must belong to the workspace's organization",
					});
				}
			}

			// Relies on the partial unique index (project_id, host_id) WHERE
			// type='main' for main-workspace idempotency.
			const result = await dbWs.transaction(async (tx) => {
				const [inserted] = await tx
					.insert(v2Workspaces)
					.values({
						...(input.id ? { id: input.id } : {}),
						organizationId: project.organizationId,
						projectId: project.id,
						name: input.name,
						branch: input.branch,
						hostId: host.machineId,
						type: input.type,
						createdByUserId: ctx.userId,
						taskId: input.taskId ?? null,
					})
					.onConflictDoNothing()
					.returning();

				if (inserted) {
					posthog.capture({
						distinctId: ctx.userId,
						event: "workspace_created",
						properties: {
							workspace_id: inserted.id,
							project_id: inserted.projectId,
							organization_id: inserted.organizationId,
							host_id: inserted.hostId,
							branch: inserted.branch,
							type: inserted.type,
						},
					});
					return inserted;
				}

				if (input.id) {
					const existing = await tx.query.v2Workspaces.findFirst({
						where: and(
							eq(v2Workspaces.id, input.id),
							eq(v2Workspaces.organizationId, project.organizationId),
						),
					});
					if (existing) return existing;
					const collision = await tx.query.v2Workspaces.findFirst({
						columns: { id: true },
						where: eq(v2Workspaces.id, input.id),
					});
					if (collision) {
						throw new TRPCError({
							code: "CONFLICT",
							message: "Workspace id already in use",
						});
					}
				}

				if (input.type === "main") {
					const existing = await tx.query.v2Workspaces.findFirst({
						where: and(
							eq(v2Workspaces.projectId, project.id),
							eq(v2Workspaces.hostId, host.machineId),
							eq(v2Workspaces.type, "main"),
						),
					});
					if (existing) {
						const patch: {
							branch?: string;
							name?: string;
						} = {};
						if (existing.branch !== input.branch) {
							patch.branch = input.branch;
							if (existing.name === existing.branch) {
								patch.name = input.name;
							}
						}
						if (Object.keys(patch).length > 0) {
							const [updated] = await tx
								.update(v2Workspaces)
								.set(patch)
								.where(eq(v2Workspaces.id, existing.id))
								.returning();
							return updated ?? existing;
						}
						return existing;
					}
				}

				return null;
			});

			if (result) return result;

			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Workspace insert returned no row (type=${input.type}, projectId=${project.id}, hostId=${host.machineId})`,
			});
		}),

	setTask: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				taskId: z.string().uuid().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const workspace = await getWorkspaceAccess(
				ctx.session.user.id,
				input.workspaceId,
				{ organizationId },
			);
			if (input.taskId) {
				const task = await dbWs.query.tasks.findFirst({
					columns: { id: true, organizationId: true },
					where: eq(tasks.id, input.taskId),
				});
				if (!task) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Task not found",
					});
				}
				if (task.organizationId !== workspace.organizationId) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Task does not belong to the workspace's organization",
					});
				}
			}
			await dbWs
				.update(v2Workspaces)
				.set({ taskId: input.taskId })
				.where(eq(v2Workspaces.id, input.workspaceId));
			return { success: true as const };
		}),

	getFromHost: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.query(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}

			return (
				(await dbWs.query.v2Workspaces.findFirst({
					where: and(
						eq(v2Workspaces.id, input.id),
						eq(v2Workspaces.organizationId, input.organizationId),
					),
				})) ?? null
			);
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				branch: z.string().min(1).optional(),
				hostId: z.string().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx, "No active organization");
			const workspace = await getWorkspaceAccess(
				ctx.session.user.id,
				input.id,
				{
					organizationId,
				},
			);

			if (input.hostId !== undefined) {
				await getScopedHost(workspace.organizationId, input.hostId);
			}

			const data = {
				branch: input.branch,
				hostId: input.hostId,
				name: input.name,
			};
			if (
				Object.keys(data).every(
					(k) => data[k as keyof typeof data] === undefined,
				)
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No fields to update",
				});
			}
			const result = await dbWs.transaction(async (tx) => {
				const [updated] = await tx
					.update(v2Workspaces)
					.set(data)
					.where(eq(v2Workspaces.id, workspace.id))
					.returning();

				const txid = await getCurrentTxid(tx);

				return { updated, txid };
			});
			const { updated, txid } = result;
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			return { ...updated, txid };
		}),

	// JWT-authed so host-service can apply AI-generated workspace names
	// after create without an end-user session. Optional `expectedCurrentName`
	// is folded into the UPDATE's WHERE so a concurrent user edit can't be
	// clobbered between check and write. `branch` is optional so the same
	// entry point covers the AI rename (name + branch together) and any
	// future name-only or branch-only updates.
	updateNameFromHost: jwtProcedure
		.input(
			z
				.object({
					id: z.string().uuid(),
					name: z.string().min(1).optional(),
					branch: z.string().min(1).optional(),
					expectedCurrentName: z.string().optional(),
				})
				.refine((v) => v.name !== undefined || v.branch !== undefined, {
					message: "At least one of name or branch must be provided",
				}),
		)
		.mutation(async ({ ctx, input }) => {
			const conditions = [
				eq(v2Workspaces.id, input.id),
				inArray(v2Workspaces.organizationId, ctx.organizationIds),
			];
			if (input.expectedCurrentName !== undefined) {
				conditions.push(eq(v2Workspaces.name, input.expectedCurrentName));
			}
			const patch: { name?: string; branch?: string } = {};
			if (input.name !== undefined) patch.name = input.name;
			if (input.branch !== undefined) patch.branch = input.branch;
			const [updated] = await dbWs
				.update(v2Workspaces)
				.set(patch)
				.where(and(...conditions))
				.returning();
			if (updated) return updated;

			// Nothing updated — disambiguate for a useful error. Happy path
			// already returned above, so this fetch only runs when id/org/name
			// failed to match.
			const workspace = await dbWs.query.v2Workspaces.findFirst({
				where: eq(v2Workspaces.id, input.id),
			});
			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			if (!ctx.organizationIds.includes(workspace.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}
			// Expected-name mismatch: a user edit landed first. Return the
			// current row so host-service can observe the skip.
			return workspace;
		}),

	// JWT-authed so host-service can orchestrate the full delete saga
	// (terminals → teardown → worktree → branch → cloud → host sqlite) via
	// its own JWT auth provider. The session-backed protectedProcedure
	// would reject host-service callers with 401.
	delete: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const workspace = await dbWs.query.v2Workspaces.findFirst({
				columns: {
					id: true,
					organizationId: true,
					type: true,
					projectId: true,
					hostId: true,
					branch: true,
				},
				where: eq(v2Workspaces.id, input.id),
			});
			if (!workspace) {
				// Already gone in the cloud; idempotent success.
				return { success: true, alreadyGone: true as const };
			}
			if (!ctx.organizationIds.includes(workspace.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}
			if (workspace.type === "main") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: MAIN_WORKSPACE_DELETE_MESSAGE,
				});
			}
			await dbWs.delete(v2Workspaces).where(eq(v2Workspaces.id, workspace.id));

			posthog.capture({
				distinctId: ctx.userId,
				event: "workspace_deleted",
				properties: {
					workspace_id: workspace.id,
					project_id: workspace.projectId,
					organization_id: workspace.organizationId,
					host_id: workspace.hostId,
					branch: workspace.branch,
					type: workspace.type,
				},
			});

			return { success: true, alreadyGone: false as const };
		}),

	// Main workspaces are not normal delete targets. This endpoint is reserved
	// for host project removal, where the repo-root workspace must be detached
	// from this host before the local project row disappears.
	deleteMainForHost: jwtProcedure
		.input(z.object({ id: z.string().uuid(), projectId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const workspace = await dbWs.query.v2Workspaces.findFirst({
				columns: {
					id: true,
					organizationId: true,
					projectId: true,
					type: true,
				},
				where: eq(v2Workspaces.id, input.id),
			});
			if (!workspace) {
				return { success: true, alreadyGone: true as const };
			}
			if (!ctx.organizationIds.includes(workspace.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}
			if (workspace.projectId !== input.projectId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Workspace does not belong to this project",
				});
			}
			if (workspace.type !== "main") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Workspace is not a main workspace",
				});
			}
			await dbWs.delete(v2Workspaces).where(eq(v2Workspaces.id, workspace.id));
			return { success: true, alreadyGone: false as const };
		}),
} satisfies TRPCRouterRecord;
