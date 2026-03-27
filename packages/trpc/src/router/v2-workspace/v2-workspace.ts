import { dbWs } from "@superset/db/client";
import { v2Devices, v2Projects, v2Workspaces } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import {
	requireActiveOrgId,
	requireActiveOrgMembership,
} from "../utils/active-org";
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

async function getScopedDevice(organizationId: string, deviceId: string) {
	return requireOrgScopedResource(
		() =>
			dbWs.query.v2Devices.findFirst({
				columns: {
					id: true,
					organizationId: true,
				},
				where: eq(v2Devices.id, deviceId),
			}),
		{
			code: "BAD_REQUEST",
			message: "Device not found in this organization",
			organizationId,
		},
	);
}

async function getScopedWorkspace(organizationId: string, workspaceId: string) {
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
	create: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				name: z.string().min(1),
				branch: z.string().min(1),
				deviceId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(
				ctx.session,
				"No active organization",
			);

			const project = await getScopedProject(organizationId, input.projectId);
			const device = await getScopedDevice(organizationId, input.deviceId);

			const [workspace] = await dbWs
				.insert(v2Workspaces)
				.values({
					organizationId: project.organizationId,
					projectId: project.id,
					name: input.name,
					branch: input.branch,
					deviceId: device.id,
					createdByUserId: ctx.session.user.id,
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
				deviceId: z.string().uuid().optional(),
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

			if (input.deviceId !== undefined) {
				await getScopedDevice(workspace.organizationId, input.deviceId);
			}

			const data = {
				branch: input.branch,
				deviceId: input.deviceId,
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

	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(
				ctx.session,
				"No active organization",
			);
			const workspace = await getScopedWorkspace(organizationId, input.id);
			await dbWs.delete(v2Workspaces).where(eq(v2Workspaces.id, workspace.id));
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
