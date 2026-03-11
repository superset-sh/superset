import { dbWs } from "@superset/db/client";
import {
	v2DevicePresence,
	v2Devices,
	v2UsersDevices,
	v2Workspaces,
} from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../integration/utils";

async function resolveDeviceId(
	input: {
		deviceId?: string;
		organizationId: string;
	},
	user: {
		id: string;
		name?: string | null;
	},
): Promise<string> {
	if (input.deviceId) {
		const existing = await dbWs.query.v2Devices.findFirst({
			where: and(
				eq(v2Devices.id, input.deviceId),
				eq(v2Devices.organizationId, input.organizationId),
			),
			columns: { id: true },
		});

		if (!existing) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Device not found in organization",
			});
		}

		return existing.id;
	}

	const [existingDevice] = await dbWs
		.select({ id: v2Devices.id })
		.from(v2UsersDevices)
		.innerJoin(v2Devices, eq(v2UsersDevices.deviceId, v2Devices.id))
		.where(
			and(
				eq(v2UsersDevices.organizationId, input.organizationId),
				eq(v2UsersDevices.userId, user.id),
				eq(v2Devices.organizationId, input.organizationId),
			),
		)
		.limit(1);

	if (existingDevice) {
		return existingDevice.id;
	}

	return dbWs.transaction(async (tx) => {
		const [device] = await tx
			.insert(v2Devices)
			.values({
				organizationId: input.organizationId,
				name: user.name ? `${user.name}'s host` : "This device",
				type: "host",
				createdByUserId: user.id,
			})
			.returning({ id: v2Devices.id });

		if (!device) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to create V2 device",
			});
		}

		await tx.insert(v2UsersDevices).values({
			organizationId: input.organizationId,
			userId: user.id,
			deviceId: device.id,
			role: "owner",
		});

		await tx.insert(v2DevicePresence).values({
			deviceId: device.id,
			organizationId: input.organizationId,
		});

		return device.id;
	});
}

export const workspacesV2Router = {
	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				projectId: z.string().uuid(),
				name: z.string().min(1),
				branch: z.string().min(1),
				deviceId: z.string().uuid().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const deviceId = await resolveDeviceId(
				{
					deviceId: input.deviceId,
					organizationId: input.organizationId,
				},
				ctx.session.user,
			);

			const [workspace] = await dbWs
				.insert(v2Workspaces)
				.values({
					organizationId: input.organizationId,
					projectId: input.projectId,
					deviceId,
					name: input.name,
					branch: input.branch,
					createdByUserId: ctx.session.user.id,
				})
				.returning();

			if (!workspace) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create V2 workspace",
				});
			}

			return workspace;
		}),

	rename: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				organizationId: z.string().uuid(),
				name: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const [workspace] = await dbWs
				.update(v2Workspaces)
				.set({ name: input.name })
				.where(
					and(
						eq(v2Workspaces.id, input.id),
						eq(v2Workspaces.organizationId, input.organizationId),
					),
				)
				.returning();

			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "V2 workspace not found",
				});
			}

			return workspace;
		}),

	delete: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				organizationId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			await dbWs
				.delete(v2Workspaces)
				.where(
					and(
						eq(v2Workspaces.id, input.id),
						eq(v2Workspaces.organizationId, input.organizationId),
					),
				);

			return { success: true };
		}),
} satisfies TRPCRouterRecord;
