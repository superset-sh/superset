import { db } from "@superset/db/client";
import {
	members,
	organizations,
	type SelectSubscription,
	subscriptions,
	users,
} from "@superset/db/schema";
import {
	isActiveSubscriptionStatus,
	isPaidPlan,
} from "@superset/shared/billing";
import {
	type CustomerHealth,
	healthFromLastActive,
	isChurnRisk,
} from "@superset/shared/customer-health";
import { stageFromUserCount } from "@superset/shared/customer-stage";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure } from "../../trpc";
import {
	fetchWeeklyActivity,
	getActivitySnapshot,
	getOrgActivityIndex,
	type UserActivity,
	WEEKLY_ACTIVITY_IDS_CAP,
} from "./activity-snapshot";

import { COMPANY_DOMAIN, domainSchema, FREEMAIL_DOMAINS } from "./domain-utils";
import { getDomainEnrichment, getPersonEnrichment } from "./enrichment";

type SubscriptionSummary = {
	plan: string;
	status: string;
	seats: number | null;
	billingInterval: string | null;
	periodEnd: Date | null;
	trialEnd: Date | null;
	cancelAtPeriodEnd: boolean;
	stripeCustomerId: string | null;
	isPaying: boolean;
};

/** Prefer the currently-paying row; otherwise the most recent one. */
function pickSubscription(
	rows: SelectSubscription[],
): SelectSubscription | null {
	if (rows.length === 0) return null;
	const ranked = [...rows].sort((a, b) => {
		const aActive = isActiveSubscriptionStatus(a.status) ? 1 : 0;
		const bActive = isActiveSubscriptionStatus(b.status) ? 1 : 0;
		if (aActive !== bActive) return bActive - aActive;
		return b.createdAt.getTime() - a.createdAt.getTime();
	});
	return ranked[0] ?? null;
}

function summarizeSubscription(
	row: SelectSubscription | null,
): SubscriptionSummary | null {
	if (!row) return null;
	return {
		plan: row.plan,
		status: row.status,
		seats: row.seats,
		billingInterval: row.billingInterval,
		periodEnd: row.periodEnd,
		trialEnd: row.trialEnd,
		cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false,
		stripeCustomerId: row.stripeCustomerId,
		isPaying: isActiveSubscriptionStatus(row.status) && isPaidPlan(row.plan),
	};
}

async function getSubscriptionsByOrg(): Promise<
	Map<string, SelectSubscription>
> {
	const rows = await db.select().from(subscriptions);
	const grouped = new Map<string, SelectSubscription[]>();
	for (const row of rows) {
		const list = grouped.get(row.referenceId);
		if (list) {
			list.push(row);
		} else {
			grouped.set(row.referenceId, [row]);
		}
	}
	const byOrg = new Map<string, SelectSubscription>();
	for (const [orgId, list] of grouped) {
		const picked = pickSubscription(list);
		if (picked) byOrg.set(orgId, picked);
	}
	return byOrg;
}

function trendPct(current: number, previous: number): number | null {
	if (previous === 0) return null;
	return Math.round(((current - previous) / previous) * 100);
}

type Surface = "desktop" | "cli" | "chat";

function topSurface(activity: UserActivity | undefined): Surface | null {
	if (!activity) return null;
	const surfaces: [Surface, number][] = [
		["desktop", activity.desktopEvents],
		["cli", activity.cliEvents],
		["chat", activity.chatEvents],
	];
	surfaces.sort((a, b) => b[1] - a[1]);
	const best = surfaces[0];
	return best && best[1] > 0 ? best[0] : null;
}

const healthFilterSchema = z.enum([
	"all",
	"active",
	"idle",
	"cooling",
	"dormant",
	"churnRisk",
]);

const DOMAIN_USERS_SHOWN_CAP = 200;
const DOMAIN_ORG_CHIPS_CAP = 30;

function getUsersByDomain(domain: string) {
	return db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			image: users.image,
			createdAt: users.createdAt,
		})
		.from(users)
		.where(ilike(users.email, `%@${domain}`));
}

export const customersRouter = {
	listCompanies: adminProcedure
		.input(
			z.object({
				page: z.number().int().min(1).default(1),
				pageSize: z.number().int().min(1).max(100).default(50),
				search: z.string().trim().max(200).optional(),
				plan: z.enum(["all", "paying", "free"]).default("all"),
				health: healthFilterSchema.default("all"),
				scope: z.enum(["customers", "all"]).default("customers"),
				sort: z
					.enum(["lastActive", "members", "events30d", "created"])
					.default("lastActive"),
			}),
		)
		.query(async ({ input }) => {
			const [index, subsByOrg] = await Promise.all([
				getOrgActivityIndex(),
				getSubscriptionsByOrg(),
			]);

			let searchOrgIds: Set<string> | null = null;
			if (input.search) {
				const term = `%${input.search}%`;
				const [orgMatches, emailMatches] = await Promise.all([
					db
						.select({ id: organizations.id })
						.from(organizations)
						.where(
							or(
								ilike(organizations.name, term),
								ilike(organizations.slug, term),
							),
						),
					db
						.select({ orgId: members.organizationId })
						.from(members)
						.innerJoin(users, eq(members.userId, users.id))
						.where(ilike(users.email, term)),
				]);
				searchOrgIds = new Set([
					...orgMatches.map((row) => row.id),
					...emailMatches.map((row) => row.orgId),
				]);
			}

			type Entry = {
				orgId: string;
				memberCount: number;
				lastActiveAt: Date | null;
				events30d: number;
				trendPct: number | null;
				activeMembers7d: number;
				health: CustomerHealth;
				churnRisk: boolean;
				subscription: SubscriptionSummary | null;
			};

			const candidateOrgIds = new Set([
				...index.byOrgId.keys(),
				...subsByOrg.keys(),
			]);

			const entries: Entry[] = [];
			for (const orgId of candidateOrgIds) {
				if (searchOrgIds && !searchOrgIds.has(orgId)) continue;

				const activity = index.byOrgId.get(orgId);
				const subscription = summarizeSubscription(
					subsByOrg.get(orgId) ?? null,
				);
				const isPaying = subscription?.isPaying ?? false;

				if (
					input.scope === "customers" &&
					!subscription &&
					!activity?.lastActiveAt
				) {
					continue;
				}
				if (input.plan === "paying" && !isPaying) continue;
				if (input.plan === "free" && isPaying) continue;

				const health = healthFromLastActive(activity?.lastActiveAt ?? null);
				const churnRisk = isChurnRisk(health, isPaying);
				if (input.health === "churnRisk" && !churnRisk) continue;
				if (
					input.health !== "all" &&
					input.health !== "churnRisk" &&
					health !== input.health
				) {
					continue;
				}

				entries.push({
					orgId,
					memberCount: activity?.memberCount ?? 0,
					lastActiveAt: activity?.lastActiveAt ?? null,
					events30d: activity?.events30d ?? 0,
					trendPct: trendPct(
						activity?.events30d ?? 0,
						activity?.events30dPrev ?? 0,
					),
					activeMembers7d: activity?.activeMembers7d ?? 0,
					health,
					churnRisk,
					subscription,
				});
			}

			let createdAtByOrg: Map<string, Date> | null = null;
			if (input.sort === "created") {
				const rows = await db
					.select({ id: organizations.id, createdAt: organizations.createdAt })
					.from(organizations)
					.where(
						inArray(
							organizations.id,
							entries.map((entry) => entry.orgId),
						),
					);
				createdAtByOrg = new Map(rows.map((row) => [row.id, row.createdAt]));
			}

			entries.sort((a, b) => {
				switch (input.sort) {
					case "members":
						return b.memberCount - a.memberCount;
					case "events30d":
						return b.events30d - a.events30d;
					case "created":
						return (
							(createdAtByOrg?.get(b.orgId)?.getTime() ?? 0) -
							(createdAtByOrg?.get(a.orgId)?.getTime() ?? 0)
						);
					default:
						return (
							(b.lastActiveAt?.getTime() ?? 0) -
							(a.lastActiveAt?.getTime() ?? 0)
						);
				}
			});

			const total = entries.length;
			const pageEntries = entries.slice(
				(input.page - 1) * input.pageSize,
				input.page * input.pageSize,
			);

			const orgRows =
				pageEntries.length > 0
					? await db
							.select({
								id: organizations.id,
								name: organizations.name,
								slug: organizations.slug,
								logo: organizations.logo,
								createdAt: organizations.createdAt,
							})
							.from(organizations)
							.where(
								inArray(
									organizations.id,
									pageEntries.map((entry) => entry.orgId),
								),
							)
					: [];
			const orgById = new Map(orgRows.map((row) => [row.id, row]));

			return {
				total,
				snapshotAt: index.fetchedAt,
				rows: pageEntries.map((entry) => {
					const org = orgById.get(entry.orgId);
					return {
						...entry,
						name: org?.name ?? "Unknown org",
						slug: org?.slug ?? null,
						logo: org?.logo ?? null,
						createdAt: org?.createdAt ?? null,
						stage: stageFromUserCount(
							entry.memberCount,
							entry.subscription?.plan === "enterprise",
						),
					};
				}),
			};
		}),

	companyDetail: adminProcedure
		.input(z.object({ orgId: z.string().uuid() }))
		.query(async ({ input }) => {
			const [org, subRows, memberRows, snapshot] = await Promise.all([
				db.query.organizations.findFirst({
					where: eq(organizations.id, input.orgId),
				}),
				db
					.select()
					.from(subscriptions)
					.where(eq(subscriptions.referenceId, input.orgId)),
				db
					.select({
						userId: members.userId,
						role: members.role,
						joinedAt: members.createdAt,
						name: users.name,
						email: users.email,
						image: users.image,
						userCreatedAt: users.createdAt,
					})
					.from(members)
					.innerJoin(users, eq(members.userId, users.id))
					.where(eq(members.organizationId, input.orgId)),
				getActivitySnapshot(),
			]);

			if (!org) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Organization not found",
				});
			}

			const subscription = summarizeSubscription(pickSubscription(subRows));
			const isPaying = subscription?.isPaying ?? false;

			const memberDetails = memberRows.map((member) => {
				const activity = snapshot.byUserId.get(member.userId.toLowerCase());
				return {
					userId: member.userId,
					name: member.name,
					email: member.email,
					image: member.image,
					role: member.role,
					joinedAt: member.joinedAt,
					userCreatedAt: member.userCreatedAt,
					lastActiveAt: activity?.lastActiveAt ?? null,
					events7d: activity?.events7d ?? 0,
					events30d: activity?.events30d ?? 0,
					activeDays30: activity?.activeDays30 ?? 0,
					topSurface: topSurface(activity),
					health: healthFromLastActive(activity?.lastActiveAt ?? null),
					hasActivityData: activity != null,
				};
			});
			memberDetails.sort(
				(a, b) =>
					(b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0),
			);

			const lastActiveAt = memberDetails[0]?.lastActiveAt ?? null;
			const health = healthFromLastActive(lastActiveAt);

			return {
				org: {
					id: org.id,
					name: org.name,
					slug: org.slug,
					logo: org.logo,
					createdAt: org.createdAt,
					allowedDomains: org.allowedDomains,
				},
				subscription,
				members: memberDetails,
				lastActiveAt,
				health,
				churnRisk: isChurnRisk(health, isPaying),
				snapshotAt: snapshot.fetchedAt,
			};
		}),

	companyActivityTimeseries: adminProcedure
		.input(
			z.object({
				orgId: z.string().uuid(),
				weeks: z.number().int().min(1).max(52).default(12),
			}),
		)
		.query(async ({ input }) => {
			const memberRows = await db
				.select({ userId: members.userId })
				.from(members)
				.where(eq(members.organizationId, input.orgId));

			return {
				points: await fetchWeeklyActivity(
					memberRows.map((row) => row.userId),
					input.weeks,
				),
			};
		}),

	domainDetail: adminProcedure
		.input(z.object({ domain: domainSchema }))
		.query(async ({ input }) => {
			const [snapshot, domainUsers, subsByOrg] = await Promise.all([
				getActivitySnapshot(),
				getUsersByDomain(input.domain),
				getSubscriptionsByOrg(),
			]);

			if (domainUsers.length === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `No users with @${input.domain} emails`,
				});
			}

			const memberRows = await db
				.select({
					organizationId: members.organizationId,
					userId: members.userId,
				})
				.from(members)
				.where(
					inArray(
						members.userId,
						domainUsers.map((user) => user.id),
					),
				);
			const orgIdsByUser = new Map<string, string[]>();
			for (const { organizationId, userId } of memberRows) {
				const list = orgIdsByUser.get(userId);
				if (list) {
					list.push(organizationId);
				} else {
					orgIdsByUser.set(userId, [organizationId]);
				}
			}

			const isPayingOrg = (orgId: string) => {
				const sub = subsByOrg.get(orgId);
				return (
					sub != null &&
					isActiveSubscriptionStatus(sub.status) &&
					isPaidPlan(sub.plan)
				);
			};

			const userDetails = domainUsers
				.map((user) => {
					const activity = snapshot.byUserId.get(user.id.toLowerCase());
					return {
						userId: user.id,
						name: user.name,
						email: user.email,
						image: user.image,
						userCreatedAt: user.createdAt,
						orgIds: orgIdsByUser.get(user.id) ?? [],
						lastActiveAt: activity?.lastActiveAt ?? null,
						events7d: activity?.events7d ?? 0,
						events30d: activity?.events30d ?? 0,
						activeDays30: activity?.activeDays30 ?? 0,
						topSurface: topSurface(activity),
						health: healthFromLastActive(activity?.lastActiveAt ?? null),
						hasActivityData: activity != null,
					};
				})
				.sort(
					(a, b) =>
						(b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0),
				);

			const shownUsers = userDetails.slice(0, DOMAIN_USERS_SHOWN_CAP);

			// Hydrate org names for the chips and the shown users' org lists.
			const allOrgIds = [
				...new Set(memberRows.map((row) => row.organizationId)),
			];
			const chipOrgIds = [...allOrgIds]
				.sort((a, b) => Number(isPayingOrg(b)) - Number(isPayingOrg(a)))
				.slice(0, DOMAIN_ORG_CHIPS_CAP);
			const nameOrgIds = [
				...new Set([
					...chipOrgIds,
					...shownUsers.flatMap((user) => user.orgIds),
				]),
			];
			const orgRows =
				nameOrgIds.length > 0
					? await db
							.select({ id: organizations.id, name: organizations.name })
							.from(organizations)
							.where(inArray(organizations.id, nameOrgIds))
					: [];
			const orgNameById = new Map(orgRows.map((row) => [row.id, row.name]));

			const lastActiveAt = userDetails[0]?.lastActiveAt ?? null;
			const payingOrgCount = allOrgIds.filter(isPayingOrg).length;

			return {
				domain: input.domain,
				stage: stageFromUserCount(userDetails.length),
				totalUsers: userDetails.length,
				activeUsers7d: userDetails.filter((user) => user.events7d > 0).length,
				events30d: userDetails.reduce((sum, user) => sum + user.events30d, 0),
				lastActiveAt,
				health: healthFromLastActive(lastActiveAt),
				totalOrgCount: allOrgIds.length,
				payingOrgCount,
				orgs: chipOrgIds.map((orgId) => ({
					id: orgId,
					name: orgNameById.get(orgId) ?? "Unknown org",
					isPaying: isPayingOrg(orgId),
				})),
				users: shownUsers.map(({ orgIds, ...user }) => ({
					...user,
					orgs: orgIds.slice(0, 3).map((orgId) => ({
						id: orgId,
						name: orgNameById.get(orgId) ?? "Unknown org",
					})),
					orgCount: orgIds.length,
				})),
				snapshotAt: snapshot.fetchedAt,
			};
		}),

	domainActivityTimeseries: adminProcedure
		.input(
			z.object({
				domain: domainSchema,
				weeks: z.number().int().min(1).max(52).default(12),
			}),
		)
		.query(async ({ input }) => {
			const [snapshot, domainUsers] = await Promise.all([
				getActivitySnapshot(),
				getUsersByDomain(input.domain),
			]);

			// Most-recently-active first so the IN-list cap keeps the users
			// that actually contribute to the chart.
			const ids = domainUsers
				.map((user) => user.id)
				.sort(
					(a, b) =>
						(snapshot.byUserId.get(b.toLowerCase())?.lastActiveAt.getTime() ??
							0) -
						(snapshot.byUserId.get(a.toLowerCase())?.lastActiveAt.getTime() ??
							0),
				);

			return {
				points: await fetchWeeklyActivity(ids, input.weeks),
				sampled: ids.length > WEEKLY_ACTIVITY_IDS_CAP,
			};
		}),

	userDetail: adminProcedure
		.input(z.object({ userId: z.string().uuid() }))
		.query(async ({ input }) => {
			const [user, memberRows, subsByOrg, snapshot] = await Promise.all([
				db.query.users.findFirst({ where: eq(users.id, input.userId) }),
				db
					.select({
						organizationId: members.organizationId,
						role: members.role,
						joinedAt: members.createdAt,
						orgName: organizations.name,
					})
					.from(members)
					.innerJoin(
						organizations,
						eq(members.organizationId, organizations.id),
					)
					.where(eq(members.userId, input.userId)),
				getSubscriptionsByOrg(),
				getActivitySnapshot(),
			]);

			if (!user) {
				throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
			}

			const activity = snapshot.byUserId.get(user.id.toLowerCase());
			const health = healthFromLastActive(activity?.lastActiveAt ?? null);
			const orgs = memberRows.map((row) => {
				const sub = subsByOrg.get(row.organizationId) ?? null;
				return {
					id: row.organizationId,
					name: row.orgName,
					role: row.role,
					joinedAt: row.joinedAt,
					isPaying:
						sub != null &&
						isActiveSubscriptionStatus(sub.status) &&
						isPaidPlan(sub.plan),
				};
			});

			return {
				user: {
					id: user.id,
					name: user.name,
					email: user.email,
					image: user.image,
					createdAt: user.createdAt,
					onboardedAt: user.onboardedAt,
				},
				orgs,
				lastActiveAt: activity?.lastActiveAt ?? null,
				events7d: activity?.events7d ?? 0,
				events30d: activity?.events30d ?? 0,
				trendPct: trendPct(
					activity?.events30d ?? 0,
					activity?.events30dPrev ?? 0,
				),
				activeDays30: activity?.activeDays30 ?? 0,
				// Per-surface event counts over the snapshot's 90d window.
				surfaces: {
					desktop: activity?.desktopEvents ?? 0,
					cli: activity?.cliEvents ?? 0,
					chat: activity?.chatEvents ?? 0,
				},
				topSurface: topSurface(activity),
				health,
				churnRisk: isChurnRisk(
					health,
					orgs.some((org) => org.isPaying),
				),
				hasActivityData: activity != null,
				snapshotAt: snapshot.fetchedAt,
			};
		}),

	userActivityTimeseries: adminProcedure
		.input(
			z.object({
				userId: z.string().uuid(),
				weeks: z.number().int().min(1).max(52).default(12),
			}),
		)
		.query(async ({ input }) => {
			return { points: await fetchWeeklyActivity([input.userId], input.weeks) };
		}),

	domainEnrichment: adminProcedure
		.input(z.object({ domain: domainSchema }))
		.query(({ input }) => getDomainEnrichment(input.domain)),

	userRoleEnrichment: adminProcedure
		.input(z.object({ userId: z.string().uuid() }))
		.query(async ({ input }) => {
			const user = await db.query.users.findFirst({
				where: eq(users.id, input.userId),
			});
			if (!user) {
				throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
			}
			const domain = user.email.split("@")[1]?.toLowerCase() ?? "";
			return getPersonEnrichment({
				cacheKey: user.id,
				name: user.name,
				domain,
			});
		}),

	domainRollup: adminProcedure
		.input(
			z.object({
				page: z.number().int().min(1).default(1),
				pageSize: z.number().int().min(1).max(100).default(50),
				minUsers: z.number().int().min(1).default(2),
				includeFreemail: z.boolean().default(false),
				health: healthFilterSchema.default("all"),
				trend: z.enum(["all", "growing", "declining"]).default("all"),
				sort: z
					.enum(["users", "events30d", "lastActive", "trend"])
					.default("users"),
			}),
		)
		.query(async ({ input }) => {
			const [snapshot, userRows, memberRows, subsByOrg] = await Promise.all([
				getActivitySnapshot(),
				db.select({ id: users.id, email: users.email }).from(users),
				db
					.select({
						organizationId: members.organizationId,
						userId: members.userId,
					})
					.from(members),
				getSubscriptionsByOrg(),
			]);

			const orgIdsByUser = new Map<string, string[]>();
			for (const { organizationId, userId } of memberRows) {
				const list = orgIdsByUser.get(userId);
				if (list) {
					list.push(organizationId);
				} else {
					orgIdsByUser.set(userId, [organizationId]);
				}
			}

			type DomainEntry = {
				domain: string;
				userCount: number;
				activeUsers7d: number;
				events30d: number;
				events30dPrev: number;
				lastActiveAt: Date | null;
				orgIds: Set<string>;
			};

			const byDomain = new Map<string, DomainEntry>();
			for (const user of userRows) {
				const domain = user.email.split("@")[1]?.toLowerCase();
				if (!domain || domain === COMPANY_DOMAIN) continue;
				if (!input.includeFreemail && FREEMAIL_DOMAINS.has(domain)) continue;

				let entry = byDomain.get(domain);
				if (!entry) {
					entry = {
						domain,
						userCount: 0,
						activeUsers7d: 0,
						events30d: 0,
						events30dPrev: 0,
						lastActiveAt: null,
						orgIds: new Set(),
					};
					byDomain.set(domain, entry);
				}
				entry.userCount += 1;
				for (const orgId of orgIdsByUser.get(user.id) ?? []) {
					entry.orgIds.add(orgId);
				}

				const activity = snapshot.byUserId.get(user.id.toLowerCase());
				if (!activity) continue;
				entry.events30d += activity.events30d;
				entry.events30dPrev += activity.events30dPrev;
				if (activity.events7d > 0) entry.activeUsers7d += 1;
				if (!entry.lastActiveAt || activity.lastActiveAt > entry.lastActiveAt) {
					entry.lastActiveAt = activity.lastActiveAt;
				}
			}

			const isPayingOrg = (orgId: string) => {
				const sub = subsByOrg.get(orgId);
				return (
					sub != null &&
					isActiveSubscriptionStatus(sub.status) &&
					isPaidPlan(sub.plan)
				);
			};

			const entries = [...byDomain.values()]
				.filter((entry) => entry.userCount >= input.minUsers)
				.map((entry) => {
					const health = healthFromLastActive(entry.lastActiveAt);
					const payingOrgCount = [...entry.orgIds].filter(isPayingOrg).length;
					return {
						...entry,
						health,
						payingOrgCount,
						churnRisk: isChurnRisk(health, payingOrgCount > 0),
						trendPct: trendPct(entry.events30d, entry.events30dPrev),
					};
				})
				.filter((entry) => {
					if (input.health === "churnRisk" && !entry.churnRisk) return false;
					if (
						input.health !== "all" &&
						input.health !== "churnRisk" &&
						entry.health !== input.health
					) {
						return false;
					}
					if (input.trend === "growing") {
						return entry.trendPct != null && entry.trendPct > 0;
					}
					if (input.trend === "declining") {
						return entry.trendPct != null && entry.trendPct < 0;
					}
					return true;
				});
			entries.sort((a, b) => {
				switch (input.sort) {
					case "events30d":
						return b.events30d - a.events30d;
					case "lastActive":
						return (
							(b.lastActiveAt?.getTime() ?? 0) -
							(a.lastActiveAt?.getTime() ?? 0)
						);
					case "trend":
						return (b.trendPct ?? -Infinity) - (a.trendPct ?? -Infinity);
					default:
						return b.userCount - a.userCount;
				}
			});

			const total = entries.length;
			const pageEntries = entries.slice(
				(input.page - 1) * input.pageSize,
				input.page * input.pageSize,
			);

			const MAX_ORGS_PER_DOMAIN = 6;
			const pageOrgIds = [
				...new Set(
					pageEntries.flatMap((entry) =>
						[...entry.orgIds].slice(0, MAX_ORGS_PER_DOMAIN),
					),
				),
			];
			const orgRows =
				pageOrgIds.length > 0
					? await db
							.select({ id: organizations.id, name: organizations.name })
							.from(organizations)
							.where(inArray(organizations.id, pageOrgIds))
					: [];
			const orgById = new Map(orgRows.map((row) => [row.id, row]));

			return {
				total,
				snapshotAt: snapshot.fetchedAt,
				rows: pageEntries.map((entry) => ({
					domain: entry.domain,
					stage: stageFromUserCount(entry.userCount),
					userCount: entry.userCount,
					activeUsers7d: entry.activeUsers7d,
					events30d: entry.events30d,
					trendPct: entry.trendPct,
					lastActiveAt: entry.lastActiveAt,
					health: entry.health,
					churnRisk: entry.churnRisk,
					totalOrgCount: entry.orgIds.size,
					payingOrgCount: entry.payingOrgCount,
					orgs: [...entry.orgIds]
						.slice(0, MAX_ORGS_PER_DOMAIN)
						.flatMap((orgId) => {
							const org = orgById.get(orgId);
							return org ? [{ id: org.id, name: org.name }] : [];
						}),
				})),
			};
		}),
} satisfies TRPCRouterRecord;
