import { db } from "@superset/db/client";
import {
	subscriptions,
	users,
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
import type { TRPCRouterRecord } from "@trpc/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { emitAppFirstOpened } from "../../lib/activation-events";
import { fetchRelayPresence } from "../../lib/relay-presence";
import { resolveUserRelayUrl } from "../../lib/relay-url";
import { jwtProcedure, userError } from "../../trpc";

// Registering a first host means the app is installed and running, so it
// also marks the user as first-opened for the activation automation.
async function emitFirstHostEvent(userId: string) {
	try {
		const [hostCount] = await db
			.select({ value: count() })
			.from(v2Hosts)
			.where(eq(v2Hosts.createdByUserId, userId));
		if (hostCount?.value !== 1) return;

		const user = await db.query.users.findFirst({
			columns: { email: true, createdAt: true },
			where: eq(users.id, userId),
		});
		if (!user) return;
		await emitAppFirstOpened(user, userId, "host.ensure");
	} catch (error) {
		console.error(
			`[host.ensure] Failed to emit first-open event for ${userId}:`,
			error,
		);
	}
}

export const hostRouter = {
	/**
	 * The relay every client and host of this user must use. Resolved here so
	 * one authenticated answer serves the desktop, its host-service, the CLI
	 * and the web app — client-side flag evaluation raced identification and
	 * silently fell back, which split hosts and clients across two relays.
	 */
	relayEndpoint: jwtProcedure.query(async ({ ctx }) => {
		return { url: await resolveUserRelayUrl(ctx.userId) };
	}),

	list: jwtProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw userError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
					i18nKey: "serverError.host.notAMemberOfThisOrganization",
				});
			}

			const rows = await db
				.select({
					machineId: v2Hosts.machineId,
					name: v2Hosts.name,
					isOnline: v2Hosts.isOnline,
					wakeCommand: v2Hosts.wakeCommand,
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

			// The relay's DOs are the presence authority; the DB flag is only
			// the fallback for hosts still on the v1 relay, which keeps writing
			// it. Callers' own bearer token is forwarded for the access checks.
			const bearer = ctx.headers.get("authorization")?.slice("Bearer ".length);
			const presence = bearer
				? await fetchRelayPresence(
						await resolveUserRelayUrl(ctx.userId),
						bearer,
						rows.map((row) =>
							buildHostRoutingKey(row.organizationId, row.machineId),
						),
					)
				: null;

			return rows.map((row) => ({
				id: row.machineId,
				name: row.name,
				online:
					presence?.[buildHostRoutingKey(row.organizationId, row.machineId)]
						?.online ?? row.isOnline,
				wakeCommand: row.wakeCommand,
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
				throw userError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
					i18nKey: "serverError.host.notAMemberOfThisOrganization",
				});
			}

			const [inserted] = await db
				.insert(v2Hosts)
				.values({
					organizationId: input.organizationId,
					machineId: input.machineId,
					name: input.name,
					createdByUserId: ctx.userId,
				})
				.onConflictDoNothing({
					target: [v2Hosts.organizationId, v2Hosts.machineId],
				})
				.returning();

			const host =
				inserted ??
				(await db.query.v2Hosts.findFirst({
					where: and(
						eq(v2Hosts.organizationId, input.organizationId),
						eq(v2Hosts.machineId, input.machineId),
					),
				}));

			if (!host) {
				throw userError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to ensure host",
					i18nKey: "serverError.host.failedToEnsureHost",
				});
			}

			if (host.createdByUserId === ctx.userId) {
				await db
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

			if (inserted) {
				await emitFirstHostEvent(ctx.userId);
			}

			return host;
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

	setOnline: jwtProcedure
		.input(z.object({ hostId: z.string().min(1), isOnline: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const parsed = parseHostRoutingKey(input.hostId);
			if (!parsed) {
				throw userError({
					code: "BAD_REQUEST",
					message: "Invalid hostId",
					i18nKey: "serverError.host.invalidHostid",
				});
			}
			if (!ctx.organizationIds.includes(parsed.organizationId)) {
				throw userError({
					code: "FORBIDDEN",
					message: "No access to this host",
					i18nKey: "serverError.host.noAccessToThisHost",
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
				throw userError({
					code: "FORBIDDEN",
					message: "No access to this host",
					i18nKey: "serverError.host.noAccessToThisHost",
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

	setWakeCommand: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				machineId: z.string().min(1),
				// The command to run to wake this host; null clears it.
				wakeCommand: z.string().trim().min(1).nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw userError({
					code: "FORBIDDEN",
					message: "No access to this host",
					i18nKey: "serverError.host.noAccessToThisHost",
				});
			}

			// Owner-only: the wake command is shared and executed locally by any
			// member who runs `hosts wake`, so only the owner may set it.
			const access = await db.query.v2UsersHosts.findFirst({
				where: and(
					eq(v2UsersHosts.userId, ctx.userId),
					eq(v2UsersHosts.organizationId, input.organizationId),
					eq(v2UsersHosts.hostId, input.machineId),
				),
				columns: { role: true },
			});
			if (!access || access.role !== "owner") {
				throw userError({
					code: "FORBIDDEN",
					message: "Only the host owner can set its wake command",
					i18nKey: "serverError.host.onlyTheHostOwnerCanSet",
				});
			}

			await db
				.update(v2Hosts)
				.set({ wakeCommand: input.wakeCommand })
				.where(
					and(
						eq(v2Hosts.organizationId, input.organizationId),
						eq(v2Hosts.machineId, input.machineId),
					),
				);
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
