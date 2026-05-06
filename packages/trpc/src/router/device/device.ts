import { db } from "@superset/db/client";
import { devicePresence, deviceTypeValues } from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";

/**
 * v1 device-presence procedures. Kept separate from the v2 host router so the
 * device_presence table stays an isolated v1 system that gets retired with
 * the rest of v1.
 */
export const deviceRouter = {
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
			const organizationId = ctx.activeOrganizationId;
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
			const organizationId = ctx.activeOrganizationId;
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
