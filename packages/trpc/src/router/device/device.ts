import { db, dbWs } from "@superset/db/client";
import {
	devicePresence,
	deviceTypeValues,
	v2DevicePresence,
	v2Devices,
	v2UsersDevices,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";

export const deviceRouter = {
	ensureV2Host: protectedProcedure
		.input(
			z.object({
				clientId: z.string().min(1),
				name: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization selected",
				});
			}

			const userId = ctx.session.user.id;
			const now = new Date();

			const [device] = await dbWs
				.insert(v2Devices)
				.values({
					organizationId,
					clientId: input.clientId,
					name: input.name,
					type: "host",
					createdByUserId: userId,
				})
				.onConflictDoUpdate({
					target: [v2Devices.organizationId, v2Devices.clientId],
					set: {
						name: input.name,
						type: "host",
					},
				})
				.returning();

			if (!device) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to ensure device",
				});
			}

			await dbWs
				.insert(v2UsersDevices)
				.values({
					organizationId,
					userId,
					deviceId: device.id,
					role: "owner",
				})
				.onConflictDoNothing({
					target: [v2UsersDevices.userId, v2UsersDevices.deviceId],
				});

			await dbWs
				.insert(v2DevicePresence)
				.values({
					deviceId: device.id,
					organizationId,
					lastSeenAt: now,
				})
				.onConflictDoUpdate({
					target: [v2DevicePresence.deviceId],
					set: {
						organizationId,
						lastSeenAt: now,
					},
				});

			return device;
		}),

	/**
	 * @deprecated Kept for backwards compat with shipped desktop/mobile clients
	 * that still call heartbeat on a 30s interval. Same logic as registerDevice.
	 */
	heartbeat: protectedProcedure
		.input(
			z.object({
				deviceId: z.string().min(1),
				deviceName: z.string().min(1),
				deviceType: z.enum(deviceTypeValues),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization selected",
				});
			}

			const userId = ctx.session.user.id;
			const now = new Date();

			await db
				.insert(devicePresence)
				.values({
					userId,
					organizationId,
					deviceId: input.deviceId,
					deviceName: input.deviceName,
					deviceType: input.deviceType,
					lastSeenAt: now,
					createdAt: now,
				})
				.onConflictDoUpdate({
					target: [devicePresence.userId, devicePresence.deviceId],
					set: {
						deviceName: input.deviceName,
						deviceType: input.deviceType,
						lastSeenAt: now,
						organizationId,
					},
				});

			return { success: true };
		}),

	/**
	 * Register device presence (called once on app startup).
	 * Upserts a row so MCP can verify device ownership.
	 */
	registerDevice: protectedProcedure
		.input(
			z.object({
				deviceId: z.string().min(1),
				deviceName: z.string().min(1),
				deviceType: z.enum(deviceTypeValues),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization selected",
				});
			}

			const userId = ctx.session.user.id;
			const now = new Date();

			const [device] = await db
				.insert(devicePresence)
				.values({
					userId,
					organizationId,
					deviceId: input.deviceId,
					deviceName: input.deviceName,
					deviceType: input.deviceType,
					lastSeenAt: now,
					createdAt: now,
				})
				.onConflictDoUpdate({
					target: [devicePresence.userId, devicePresence.deviceId],
					set: {
						deviceName: input.deviceName,
						deviceType: input.deviceType,
						lastSeenAt: now,
						organizationId,
					},
				})
				.returning();

			return { device, timestamp: now };
		}),
} satisfies TRPCRouterRecord;
