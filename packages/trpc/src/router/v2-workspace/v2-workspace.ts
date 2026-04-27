import { dbWs } from "@superset/db/client";
import { v2Hosts, v2Projects, v2Workspaces } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
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
				hostId: z.string().uuid().optional(),
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
