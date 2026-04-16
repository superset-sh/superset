import { dbWs } from "@superset/db/client";
import { v2Hosts, v2Projects, v2Workspaces } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { jwtProcedure, protectedProcedure } from "../../trpc";
import { requireActiveOrgId } from "../utils/active-org";
import {
	requireOrgResourceAccess,
	requireOrgScopedResource,
} from "../utils/org-resource-access";

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
					id: true,
					organizationId: true,
				},
				where: eq(v2Hosts.id, hostId),
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
	create: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				projectId: z.string().uuid(),
				name: z.string().min(1),
				branch: z.string().min(1),
				hostId: z.string().uuid(),
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

			const [workspace] = await dbWs
				.insert(v2Workspaces)
				.values({
					organizationId: project.organizationId,
					projectId: project.id,
					name: input.name,
					branch: input.branch,
					hostId: host.id,
					createdByUserId: ctx.userId,
				})
				.returning();
			return workspace;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				branch: z.string().min(1).optional(),
				hostId: z.string().uuid().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(
				ctx.session,
				"No active organization",
			);
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
			const [updated] = await dbWs
				.update(v2Workspaces)
				.set(data)
				.where(eq(v2Workspaces.id, workspace.id))
				.returning();
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			return updated;
		}),

	// JWT-authed so host-service can orchestrate the full delete saga
	// (terminals → teardown → worktree → branch → cloud → host sqlite) via
	// its own JWT auth provider. The session-backed protectedProcedure
	// would reject host-service callers with 401.
	delete: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const workspace = await dbWs.query.v2Workspaces.findFirst({
				columns: { id: true, organizationId: true },
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
			await dbWs.delete(v2Workspaces).where(eq(v2Workspaces.id, workspace.id));
			return { success: true, alreadyGone: false as const };
		}),
} satisfies TRPCRouterRecord;
