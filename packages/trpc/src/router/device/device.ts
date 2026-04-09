import { db, dbWs } from "@superset/db/client";
import {
	devicePresence,
	deviceTypeValues,
	v2Clients,
	v2ClientTypeValues,
	v2Hosts,
	v2UsersHosts,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { jwtProcedure, protectedProcedure } from "../../trpc";

export const deviceRouter = {
	ensureV2Host: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				machineId: z.string().min(1),
				name: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}

			const [host] = await dbWs
				.insert(v2Hosts)
				.values({
					organizationId: input.organizationId,
					machineId: input.machineId,
					name: input.name,
					createdByUserId: ctx.userId,
				})
				.onConflictDoUpdate({
					target: [v2Hosts.organizationId, v2Hosts.machineId],
					set: {
						name: input.name,
					},
				})
				.returning();

			if (!host) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to ensure host",
				});
			}

			await dbWs
				.insert(v2UsersHosts)
				.values({
					organizationId: input.organizationId,
					userId: ctx.userId,
					hostId: host.id,
					role: "owner",
				})
				.onConflictDoNothing({
					target: [
						v2UsersHosts.organizationId,
						v2UsersHosts.userId,
						v2UsersHosts.hostId,
					],
				});

			return host;
		}),

	ensureV2Client: protectedProcedure
		.input(
			z.object({
				machineId: z.string().min(1),
				type: z.enum(v2ClientTypeValues),
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

			const [client] = await dbWs
				.insert(v2Clients)
				.values({
					organizationId,
					userId,
					machineId: input.machineId,
					type: input.type,
				})
				.onConflictDoUpdate({
					target: [
						v2Clients.organizationId,
						v2Clients.userId,
						v2Clients.machineId,
					],
					set: {
						type: input.type,
					},
				})
				.returning();

			if (!client) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to ensure client",
				});
			}

			return client;
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
	checkHostAccess: jwtProcedure
		.input(z.object({ hostId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const row = await db.query.v2UsersHosts.findFirst({
				where: and(
					eq(v2UsersHosts.userId, ctx.userId),
					eq(v2UsersHosts.hostId, input.hostId),
				),
				columns: { id: true },
			});
			return { allowed: !!row };
		}),

	setHostOnline: jwtProcedure
		.input(z.object({ hostId: z.string().uuid(), isOnline: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const access = await db.query.v2UsersHosts.findFirst({
				where: and(
					eq(v2UsersHosts.userId, ctx.userId),
					eq(v2UsersHosts.hostId, input.hostId),
				),
				columns: { id: true },
			});
			if (!access) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No access to this host",
				});
			}
			await db
				.update(v2Hosts)
				.set({ isOnline: input.isOnline })
				.where(eq(v2Hosts.id, input.hostId));
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
