import { mintUserJwt } from "@superset/auth/server";
import { db, dbWs } from "@superset/db/client";
import {
	subscriptions,
	v2Clients,
	v2ClientTypeValues,
	v2Hosts,
	v2UsersHosts,
} from "@superset/db/schema";
import {
	ACTIVE_SUBSCRIPTION_STATUSES,
	isActiveSubscriptionStatus,
	isPaidPlan,
} from "@superset/shared/billing";
import {
	buildHostRoutingKey,
	parseHostRoutingKey,
} from "@superset/shared/host-routing";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { jwtProcedure, protectedProcedure } from "../../trpc";
import { RelayDispatchError, relayQuery } from "../automation/relay-client";
import { hostUpdateProcedures } from "./update";

export const hostRouter = {
	list: jwtProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}

			const rows = await db
				.select({
					machineId: v2Hosts.machineId,
					name: v2Hosts.name,
					isOnline: v2Hosts.isOnline,
					organizationId: v2Hosts.organizationId,
				})
				.from(v2Hosts)
				.innerJoin(
					v2UsersHosts,
					and(
						eq(v2UsersHosts.organizationId, v2Hosts.organizationId),
						eq(v2UsersHosts.hostId, v2Hosts.machineId),
					),
				)
				.where(
					and(
						eq(v2Hosts.organizationId, input.organizationId),
						eq(v2UsersHosts.userId, ctx.userId),
					),
				);

			return rows.map((row) => ({
				id: row.machineId,
				name: row.name,
				online: row.isOnline,
				organizationId: row.organizationId,
			}));
		}),

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

			if (host.createdByUserId === ctx.userId) {
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
			}

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
			const parsed = parseHostRoutingKey(input.hostId);
			if (!parsed) return { allowed: false, paidPlan: false };
			if (!ctx.organizationIds.includes(parsed.organizationId)) {
				return { allowed: false, paidPlan: false };
			}
			const [row] = await db
				.select({
					hostId: v2UsersHosts.hostId,
					subscriptionPlan: subscriptions.plan,
					subscriptionStatus: subscriptions.status,
				})
				.from(v2UsersHosts)
				.leftJoin(
					subscriptions,
					and(
						eq(subscriptions.referenceId, v2UsersHosts.organizationId),
						inArray(subscriptions.status, ACTIVE_SUBSCRIPTION_STATUSES),
					),
				)
				.where(
					and(
						eq(v2UsersHosts.userId, ctx.userId),
						eq(v2UsersHosts.organizationId, parsed.organizationId),
						eq(v2UsersHosts.hostId, parsed.machineId),
					),
				)
				.orderBy(desc(subscriptions.createdAt))
				.limit(1);

			const allowed = !!row;
			const paidPlan =
				!!row &&
				isPaidPlan(row.subscriptionPlan) &&
				isActiveSubscriptionStatus(row.subscriptionStatus);
			return { allowed, paidPlan };
		}),

	update: hostUpdateProcedures.update,
	reportUpdate: hostUpdateProcedures.reportUpdate,

	info: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				machineId: z.string().min(1),
			}),
		)
		.query(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}

			const [link] = await db
				.select({ hostId: v2UsersHosts.hostId })
				.from(v2UsersHosts)
				.where(
					and(
						eq(v2UsersHosts.userId, ctx.userId),
						eq(v2UsersHosts.organizationId, input.organizationId),
						eq(v2UsersHosts.hostId, input.machineId),
					),
				)
				.limit(1);
			if (!link) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No access to this host",
				});
			}

			const jwt = await mintUserJwt({
				userId: ctx.userId,
				email: ctx.email,
				organizationIds: [input.organizationId],
				scope: "host-info",
				ttlSeconds: 60,
			});

			const routingKey = buildHostRoutingKey(
				input.organizationId,
				input.machineId,
			);

			try {
				return await relayQuery<
					Record<string, never>,
					{
						hostId: string;
						hostName: string;
						version: string;
						binaryVersion: string;
						supportsRemoteUpdate: boolean;
						organization: { id: string; name: string; slug: string };
						platform: string;
						uptime: number;
					}
				>(
					{
						relayUrl: env.RELAY_URL,
						hostId: routingKey,
						jwt,
						timeoutMs: 8_000,
					},
					"host.info",
					{},
				);
			} catch (error) {
				if (error instanceof RelayDispatchError) {
					throw new TRPCError({
						code: "BAD_GATEWAY",
						message: `Host did not respond: ${error.message}`,
						cause: error,
					});
				}
				throw error;
			}
		}),

	setOnline: jwtProcedure
		.input(z.object({ hostId: z.string().min(1), isOnline: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const parsed = parseHostRoutingKey(input.hostId);
			if (!parsed) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid hostId" });
			}
			if (!ctx.organizationIds.includes(parsed.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No access to this host",
				});
			}

			const access = await db.query.v2UsersHosts.findFirst({
				where: and(
					eq(v2UsersHosts.userId, ctx.userId),
					eq(v2UsersHosts.organizationId, parsed.organizationId),
					eq(v2UsersHosts.hostId, parsed.machineId),
				),
				columns: { hostId: true },
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
				.where(
					and(
						eq(v2Hosts.organizationId, parsed.organizationId),
						eq(v2Hosts.machineId, parsed.machineId),
					),
				);
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
