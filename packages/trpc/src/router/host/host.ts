import { db, dbWs } from "@superset/db/client";
import {
	members,
	subscriptions,
	users,
	v2AgentStatus,
	v2Hosts,
	v2UsersHosts,
} from "@superset/db/schema";
import { AGENT_CARD_STATES } from "@superset/shared/agent-status";
import {
	ACTIVE_SUBSCRIPTION_STATUSES,
	isActiveSubscriptionStatus,
	isPaidPlan,
} from "@superset/shared/billing";
import {
	buildHostRoutingKey,
	parseHostRoutingKey,
} from "@superset/shared/host-routing";
import { HOST_INSTALL_SOURCES } from "@superset/shared/host-version";
import type { TRPCRouterRecord } from "@trpc/server";
import { waitUntil } from "@vercel/functions";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { emitAppFirstOpened } from "../../lib/activation-events";
import { pushCardsForHost } from "../../lib/live-activity";
import { nudge } from "../../lib/realtime";
import { fetchRelayPresence } from "../../lib/relay-presence";
import { jwtProcedure, userError } from "../../trpc";
import { registerHost } from "./registration";
import {
	authorizeHostUpdate,
	hostUpdateAuthorizationSchema,
} from "./update-access";

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

async function isHostOwner(
	organizationId: string,
	machineId: string,
	userId: string,
	database: Pick<typeof db, "select"> = db,
): Promise<boolean> {
	const [owner] = await database
		.select({ hostId: v2UsersHosts.hostId })
		.from(v2UsersHosts)
		.innerJoin(
			members,
			and(
				eq(members.organizationId, v2UsersHosts.organizationId),
				eq(members.userId, v2UsersHosts.userId),
			),
		)
		.where(
			and(
				eq(v2UsersHosts.organizationId, organizationId),
				eq(v2UsersHosts.hostId, machineId),
				eq(v2UsersHosts.userId, userId),
				eq(v2UsersHosts.role, "owner"),
			),
		)
		.limit(1);
	return !!owner;
}

export const hostRouter = {
	/**
	 * The relay every client and host of this user must use. Answered here so
	 * the desktop, its host-service, the CLI and the web app all read one
	 * value instead of resolving it separately and landing on different relays.
	 */
	relayEndpoint: jwtProcedure.query(() => {
		return { url: env.RELAY_URL };
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
					wakeCommand: v2Hosts.wakeCommand,
					organizationId: v2Hosts.organizationId,
					version: v2Hosts.version,
					platform: v2Hosts.platform,
					installSource: v2Hosts.installSource,
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

			// The relay's Durable Objects are the presence authority. Callers'
			// own bearer token is forwarded for the access checks.
			const bearer = ctx.headers.get("authorization")?.slice("Bearer ".length);
			const presence = bearer
				? await fetchRelayPresence(
						env.RELAY_URL,
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
						?.online ?? false,
				wakeCommand: row.wakeCommand,
				organizationId: row.organizationId,
				version: row.version,
				platform: row.platform,
				installSource: row.installSource,
			}));
		}),

	ensure: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				machineId: z.string().min(1),
				name: z.string().min(1),
				// The build serving this host. A host-service reports these once
				// per process, at registration; a restart re-registers, so they
				// stay exact without any heartbeat. Optional so host-services that
				// predate the fields keep registering.
				version: z.string().min(1).max(64).optional(),
				platform: z.string().min(1).max(32).optional(),
				installSource: z.enum(HOST_INSTALL_SOURCES).optional(),
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

			const scope = and(
				eq(v2Hosts.organizationId, input.organizationId),
				eq(v2Hosts.machineId, input.machineId),
			);
			const { host, inserted } = await dbWs.transaction(async (tx) =>
				registerHost(input, {
					insert: async () =>
						(
							await tx
								.insert(v2Hosts)
								.values({ ...input, createdByUserId: ctx.userId })
								.onConflictDoNothing({
									target: [v2Hosts.organizationId, v2Hosts.machineId],
								})
								.returning()
						)[0],
					grantOwner: async () => {
						await tx
							.insert(v2UsersHosts)
							.values({
								organizationId: input.organizationId,
								userId: ctx.userId,
								hostId: input.machineId,
								role: "owner",
							})
							.onConflictDoNothing();
					},
					isOwner: () =>
						isHostOwner(input.organizationId, input.machineId, ctx.userId, tx),
					update: async (metadata) =>
						(
							await tx.update(v2Hosts).set(metadata).where(scope).returning()
						)[0],
					read: () => tx.query.v2Hosts.findFirst({ where: scope }),
				}),
			);

			if (!host) {
				throw userError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to ensure host",
					i18nKey: "serverError.host.failedToEnsureHost",
				});
			}

			if (inserted) {
				await emitFirstHostEvent(ctx.userId);
			}
			nudge(input.organizationId, "hosts");
			return host;
		}),

	// The host uses its own owner credential to check the relay-authenticated
	// requester. Neither organization membership nor a claimed machine id is enough.
	authorizeUpdate: jwtProcedure
		.input(hostUpdateAuthorizationSchema)
		.query(({ ctx, input }) => authorizeHostUpdate(ctx, input, isHostOwner)),

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

	/**
	 * A host's agents changed what they want. The cloud keeps only the latest
	 * card state per terminal so it can push the Lock Screen card; the host
	 * batches and debounces, so one call carries a quiet period's changes.
	 */
	reportAgentStatus: jwtProcedure
		.input(
			z.object({
				machineId: z.string().min(1),
				terminals: z
					.array(
						z.object({
							terminalId: z.string().min(1),
							workspaceId: z.string(),
							workspaceName: z.string(),
							projectId: z.string().optional(),
							projectName: z.string().optional(),
							state: z.enum([...AGENT_CARD_STATES, "gone"]),
							sinceAt: z.number(),
						}),
					)
					.min(1)
					.max(200),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;
			if (!organizationId) {
				throw userError({
					code: "BAD_REQUEST",
					message: "No active organization",
					i18nKey: "serverError.billing.noActiveOrganization",
				});
			}
			const access = await db.query.v2UsersHosts.findFirst({
				where: and(
					eq(v2UsersHosts.organizationId, organizationId),
					eq(v2UsersHosts.userId, ctx.userId),
					eq(v2UsersHosts.hostId, input.machineId),
				),
			});
			if (!access) {
				throw userError({
					code: "FORBIDDEN",
					message: "No access to this host",
					i18nKey: "serverError.host.noAccessToThisHost",
				});
			}

			const gone = input.terminals.filter((t) => t.state === "gone");
			const live = input.terminals.flatMap((t) =>
				t.state === "gone"
					? []
					: [
							{
								organizationId,
								machineId: input.machineId,
								terminalId: t.terminalId,
								workspaceId: t.workspaceId,
								workspaceName: t.workspaceName,
								projectId: t.projectId ?? null,
								projectName: t.projectName ?? null,
								state: t.state,
								sinceAt: new Date(t.sinceAt),
							},
						],
			);
			await db.transaction(async (tx) => {
				if (gone.length > 0) {
					await tx.delete(v2AgentStatus).where(
						and(
							eq(v2AgentStatus.organizationId, organizationId),
							eq(v2AgentStatus.machineId, input.machineId),
							inArray(
								v2AgentStatus.terminalId,
								gone.map((t) => t.terminalId),
							),
						),
					);
				}
				if (live.length > 0) {
					await tx
						.insert(v2AgentStatus)
						.values(live)
						.onConflictDoUpdate({
							target: [
								v2AgentStatus.organizationId,
								v2AgentStatus.machineId,
								v2AgentStatus.terminalId,
							],
							set: {
								workspaceId: sql`excluded.workspace_id`,
								workspaceName: sql`excluded.workspace_name`,
								projectId: sql`excluded.project_id`,
								projectName: sql`excluded.project_name`,
								state: sql`excluded.state`,
								sinceAt: sql`excluded.since_at`,
							},
						});
				}
			});

			// Working is the frequent, boring transition; only the moments a
			// person cares about spend Apple's per-device high-priority budget.
			const urgent = input.terminals.some((t) => t.state !== "working");
			waitUntil(
				pushCardsForHost({
					organizationId,
					machineId: input.machineId,
					priority: urgent ? 10 : 5,
				}).catch((error) => {
					console.warn("[live-activity] push after report failed:", error);
				}),
			);
			return { ok: true as const };
		}),
} satisfies TRPCRouterRecord;
