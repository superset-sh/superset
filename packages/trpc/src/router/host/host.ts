import { db, dbWs } from "@superset/db/client";
import {
	v2Clients,
	v2ClientTypeValues,
	v2Hosts,
	v2UsersHosts,
} from "@superset/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { jwtProcedure, protectedProcedure } from "../../trpc";

export const hostRouter = {
	ensure: jwtProcedure
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
					hostId: host.machineId,
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

	ensureClient: protectedProcedure
		.input(
			z.object({
				machineId: z.string().min(1),
				type: z.enum(v2ClientTypeValues),
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

	checkAccess: jwtProcedure
		.input(z.object({ hostId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const row = await db.query.v2UsersHosts.findFirst({
				where: and(
					eq(v2UsersHosts.userId, ctx.userId),
					inArray(v2UsersHosts.organizationId, ctx.organizationIds),
					eq(v2UsersHosts.hostId, input.hostId),
				),
				columns: { hostId: true },
			});
			return { allowed: !!row };
		}),

	setOnline: jwtProcedure
		.input(z.object({ hostId: z.string().min(1), isOnline: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const memberships = await db
				.select({ organizationId: v2UsersHosts.organizationId })
				.from(v2UsersHosts)
				.where(
					and(
						eq(v2UsersHosts.userId, ctx.userId),
						inArray(v2UsersHosts.organizationId, ctx.organizationIds),
						eq(v2UsersHosts.hostId, input.hostId),
					),
				);

			if (memberships.length === 0) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No access to this host",
				});
			}

			await db
				.update(v2Hosts)
				.set({ isOnline: input.isOnline })
				.where(
					and(
						inArray(
							v2Hosts.organizationId,
							memberships.map((m) => m.organizationId),
						),
						eq(v2Hosts.machineId, input.hostId),
					),
				);
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
