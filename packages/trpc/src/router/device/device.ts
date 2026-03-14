import { db, dbWs } from "@superset/db/client";
import {
	devicePresence,
	deviceTypeValues,
	users,
	v2DevicePresence,
	v2Devices,
	v2UsersDevices,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";

const OFFLINE_THRESHOLD_MS = 60_000;

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
	 * Register or update device presence (heartbeat)
	 * Called by desktop/mobile apps to indicate they're online
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

	/**
	 * List online devices in the organization
	 */
	listOnlineDevices: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = ctx.session.session.activeOrganizationId;
		if (!organizationId) {
			return [];
		}

		const threshold = new Date(Date.now() - OFFLINE_THRESHOLD_MS);

		const devices = await db
			.select({
				id: devicePresence.id,
				deviceId: devicePresence.deviceId,
				deviceName: devicePresence.deviceName,
				deviceType: devicePresence.deviceType,
				lastSeenAt: devicePresence.lastSeenAt,
				createdAt: devicePresence.createdAt,
				ownerId: devicePresence.userId,
				ownerName: users.name,
				ownerEmail: users.email,
			})
			.from(devicePresence)
			.innerJoin(users, eq(devicePresence.userId, users.id))
			.where(
				and(
					eq(devicePresence.organizationId, organizationId),
					gt(devicePresence.lastSeenAt, threshold),
				),
			);

		return devices;
	}),
} satisfies TRPCRouterRecord;
