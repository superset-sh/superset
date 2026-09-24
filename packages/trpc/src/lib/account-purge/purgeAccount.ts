import { stripeClient } from "@superset/auth/stripe";
import { db, dbWs } from "@superset/db/client";
import {
	accounts,
	members,
	oauthAccessTokens,
	oauthConsents,
	oauthRefreshTokens,
	organizations,
	sessions,
	subscriptions,
	teamMembers,
	userIdentities,
	users,
	v2Clients,
	v2UsersHosts,
} from "@superset/db/schema";
import { and, count, eq, ne } from "drizzle-orm";

import { deletePostHogPerson } from "../posthog-persons";

async function deleteCustomerIfNeverCharged(customerId: string) {
	for await (const charge of stripeClient.charges.list({
		customer: customerId,
		limit: 100,
	})) {
		if (charge.status === "succeeded") return;
	}
	try {
		await stripeClient.customers.del(customerId);
	} catch (error) {
		const alreadyDeleted =
			error instanceof Error &&
			"code" in error &&
			error.code === "resource_missing";
		if (!alreadyDeleted) throw error;
	}
}

/** Hard purge — the terminal step of account deletion (grace period is
 * user-facing, see user.deleteAccount; the daily job in apps/api purges
 * accounts whose window has passed, and admin.deleteUser purges on request).
 * The PostHog person (distinct_id = user id) is deleted along with their
 * events. Sole-member orgs go too, with their Stripe subscriptions cancelled
 * first since raw org deletes bypass beforeDeleteOrganization, and their
 * Stripe customer deleted unless it was ever successfully charged (refunded
 * charges count): a paid customer and all its billing history are kept.
 * Shared orgs keep their customer and get their seat quantity decremented
 * here because the member-row FK cascade never fires afterRemoveMember. All
 * external deletions run before the tombstone transaction and treat an
 * already-deleted person or customer as done, so a purge that fails partway
 * is safe to re-run. Deliberately silent — no removal or billing emails. */
export async function purgeAccount(userId: string): Promise<void> {
	await deletePostHogPerson(userId);

	const memberships = await db.query.members.findMany({
		where: eq(members.userId, userId),
	});
	for (const membership of memberships) {
		const [otherMembers] = await db
			.select({ value: count() })
			.from(members)
			.where(
				and(
					eq(members.organizationId, membership.organizationId),
					ne(members.userId, userId),
				),
			);
		const remainingSeats = otherMembers?.value ?? 0;

		if (remainingSeats > 0) {
			const subscription = await db.query.subscriptions.findFirst({
				where: and(
					eq(subscriptions.referenceId, membership.organizationId),
					eq(subscriptions.status, "active"),
				),
			});
			if (
				subscription?.stripeSubscriptionId &&
				subscription.plan !== "enterprise"
			) {
				const stripeSub = await stripeClient.subscriptions.retrieve(
					subscription.stripeSubscriptionId,
				);
				const itemId = stripeSub.items.data[0]?.id;
				if (itemId) {
					await stripeClient.subscriptions.update(
						subscription.stripeSubscriptionId,
						{
							items: [{ id: itemId, quantity: remainingSeats }],
							proration_behavior: "create_prorations",
						},
					);
				}
			}
			continue;
		}

		const organization = await db.query.organizations.findFirst({
			where: eq(organizations.id, membership.organizationId),
			columns: { id: true, stripeCustomerId: true },
		});
		if (organization?.stripeCustomerId) {
			const activeSubscriptions = await stripeClient.subscriptions.list({
				customer: organization.stripeCustomerId,
				status: "active",
			});
			for (const subscription of activeSubscriptions.data) {
				await stripeClient.subscriptions.cancel(subscription.id);
			}
			await deleteCustomerIfNeverCharged(organization.stripeCustomerId);
		}
		await db
			.delete(organizations)
			.where(eq(organizations.id, membership.organizationId));
	}

	// Tombstone rather than delete. `tasks.creator_id`,
	// `integration_connections.connected_by_user_id`,
	// `github_installations.connected_by_user_id` and
	// `automations.owner_user_id` all cascade from `auth.users`, so removing
	// the row would take an organization's tasks, its Slack and Linear
	// connections and its GitHub install with it — including for orgs the
	// loop above deliberately kept alive because other members remain.
	// neon-http has no transactions; the pooled client does.
	await dbWs.transaction(async (tx) => {
		// Everything that lets this person sign in or act on anything.
		await tx.delete(sessions).where(eq(sessions.userId, userId));
		await tx.delete(accounts).where(eq(accounts.userId, userId));
		await tx
			.delete(oauthAccessTokens)
			.where(eq(oauthAccessTokens.userId, userId));
		await tx
			.delete(oauthRefreshTokens)
			.where(eq(oauthRefreshTokens.userId, userId));
		await tx.delete(oauthConsents).where(eq(oauthConsents.userId, userId));
		await tx.delete(members).where(eq(members.userId, userId));
		await tx.delete(teamMembers).where(eq(teamMembers.userId, userId));
		await tx.delete(v2UsersHosts).where(eq(v2UsersHosts.userId, userId));
		await tx.delete(v2Clients).where(eq(v2Clients.userId, userId));
		await tx.delete(userIdentities).where(eq(userIdentities.userId, userId));

		// The row survives so authorship still resolves, but carries nothing
		// identifying. The email is rewritten rather than blanked so it is
		// released for re-registration without breaking the unique index.
		await tx
			.update(users)
			.set({
				deletedAt: new Date(),
				name: "Deleted user",
				email: `deleted+${userId}@deleted.invalid`,
				emailVerified: false,
				image: null,
				organizationIds: [],
			})
			.where(eq(users.id, userId));
	});
}
