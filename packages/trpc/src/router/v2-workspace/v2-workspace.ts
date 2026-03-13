import { dbWs } from "@superset/db/client";
import { v2Devices, v2Projects, v2Workspaces } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../integration/utils";

export const v2WorkspaceRouter = {
	create: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				name: z.string().min(1),
				branch: z.string().min(1),
				deviceId: z.string().uuid().optional(),
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
			await verifyOrgMembership(ctx.session.user.id, organizationId);

			const project = await dbWs.query.v2Projects.findFirst({
				where: and(
					eq(v2Projects.id, input.projectId),
					eq(v2Projects.organizationId, organizationId),
				),
			});
			if (!project) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Project not found in this organization",
				});
			}

			if (input.deviceId) {
				const device = await dbWs.query.v2Devices.findFirst({
					where: and(
						eq(v2Devices.id, input.deviceId),
						eq(v2Devices.organizationId, organizationId),
					),
				});
				if (!device) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Device not found in this organization",
					});
				}
			}

			const [workspace] = await dbWs
				.insert(v2Workspaces)
				.values({
					organizationId,
					projectId: input.projectId,
					name: input.name,
					branch: input.branch,
					deviceId: input.deviceId,
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
				deviceId: z.string().uuid().nullish(),
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
			await verifyOrgMembership(ctx.session.user.id, organizationId);

			if (input.deviceId) {
				const device = await dbWs.query.v2Devices.findFirst({
					where: and(
						eq(v2Devices.id, input.deviceId),
						eq(v2Devices.organizationId, organizationId),
					),
				});
				if (!device) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Device not found in this organization",
					});
				}
			}

			const { id, ...data } = input;
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
				.where(
					and(
						eq(v2Workspaces.id, id),
						eq(v2Workspaces.organizationId, organizationId),
					),
				)
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
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}
			await verifyOrgAdmin(ctx.session.user.id, organizationId);
			await dbWs
				.delete(v2Workspaces)
				.where(
					and(
						eq(v2Workspaces.id, input.id),
						eq(v2Workspaces.organizationId, organizationId),
					),
				);
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
