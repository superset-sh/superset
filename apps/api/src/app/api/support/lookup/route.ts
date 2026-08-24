import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@superset/db/client";
import {
	members,
	organizations,
	subscriptions,
	users,
} from "@superset/db/schema";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@superset/shared/billing";
import { bearerToken } from "@superset/trpc/automation-webhook-secret";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";

export const dynamic = "force-dynamic";

const rateLimit = new Ratelimit({
	redis: new Redis({
		url: env.KV_REST_API_URL,
		token: env.KV_REST_API_TOKEN,
	}),
	limiter: Ratelimit.slidingWindow(60, "1 m"),
	prefix: "ratelimit:support:lookup",
});

/**
 * Read-only account lookup for the support agent:
 * `GET /api/support/lookup?email=...` with `Authorization: Bearer
 * $SUPPORT_LOOKUP_TOKEN`. Returns the user plus, per organization they belong
 * to, the current plan (active/trialing subscription, newest first) and both
 * billed and actual seat counts. Answers 404 while the token env is unset so
 * the surface does not exist until it is deliberately configured.
 */
export async function GET(request: Request): Promise<Response> {
	const secret = env.SUPPORT_LOOKUP_TOKEN;
	if (!secret) {
		return Response.json(
			{ error: "Support lookup not configured" },
			{ status: 404 },
		);
	}
	const token = bearerToken(request.headers.get("authorization")) ?? "";
	// Digest both sides so the comparison is fixed-size and leaks nothing
	// about the configured token's length.
	const tokenDigest = createHash("sha256").update(token).digest();
	const secretDigest = createHash("sha256").update(secret).digest();
	if (!timingSafeEqual(tokenDigest, secretDigest)) {
		return Response.json({ error: "Invalid bearer token" }, { status: 401 });
	}

	const { success: withinLimit } = await rateLimit.limit(
		createHash("sha256").update(token).digest("hex"),
	);
	if (!withinLimit) {
		return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
	}

	const emailParam = new URL(request.url).searchParams.get("email") ?? "";
	const email = z.string().email().safeParse(emailParam.trim().toLowerCase());
	if (!email.success) {
		return Response.json(
			{ error: "Query param email must be a valid email address" },
			{ status: 400 },
		);
	}

	const user = await db.query.users.findFirst({
		columns: {
			id: true,
			name: true,
			email: true,
			onboardedAt: true,
			deletionRequestedAt: true,
			createdAt: true,
		},
		where: and(
			eq(sql`lower(${users.email})`, email.data),
			isNull(users.deletedAt),
		),
	});
	if (!user) {
		return Response.json({ found: false, user: null, organizations: [] });
	}

	const memberships = await db
		.select({
			organizationId: organizations.id,
			organizationName: organizations.name,
			organizationSlug: organizations.slug,
			stripeCustomerId: organizations.stripeCustomerId,
			role: members.role,
			subscription: subscriptions,
		})
		.from(members)
		.innerJoin(organizations, eq(organizations.id, members.organizationId))
		.leftJoin(
			subscriptions,
			and(
				eq(subscriptions.referenceId, members.organizationId),
				inArray(subscriptions.status, ACTIVE_SUBSCRIPTION_STATUSES),
			),
		)
		.where(eq(members.userId, user.id))
		.orderBy(desc(subscriptions.createdAt));

	// One active-subscription row per org (the join can fan out on the
	// pathological multi-subscription case; newest wins via the sort above).
	const byOrg = new Map<string, (typeof memberships)[number]>();
	for (const row of memberships) {
		if (!byOrg.has(row.organizationId)) byOrg.set(row.organizationId, row);
	}

	const seatCounts = byOrg.size
		? await db
				.select({ organizationId: members.organizationId, seats: count() })
				.from(members)
				.where(inArray(members.organizationId, [...byOrg.keys()]))
				.groupBy(members.organizationId)
		: [];
	const actualSeats = new Map(
		seatCounts.map((s) => [s.organizationId, s.seats]),
	);

	return Response.json({
		found: true,
		user,
		organizations: [...byOrg.values()].map((m) => ({
			id: m.organizationId,
			name: m.organizationName,
			slug: m.organizationSlug,
			role: m.role,
			stripeCustomerId: m.stripeCustomerId,
			plan: m.subscription?.plan ?? "free",
			subscription: m.subscription
				? {
						status: m.subscription.status,
						billingInterval: m.subscription.billingInterval,
						periodEnd: m.subscription.periodEnd,
						cancelAtPeriodEnd: m.subscription.cancelAtPeriodEnd,
						trialEnd: m.subscription.trialEnd,
						seatsBilled: m.subscription.seats,
						stripeSubscriptionId: m.subscription.stripeSubscriptionId,
					}
				: null,
			seatsActual: actualSeats.get(m.organizationId) ?? 0,
		})),
	});
}
