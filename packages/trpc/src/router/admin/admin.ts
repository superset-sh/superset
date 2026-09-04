import { auth } from "@superset/auth/server";
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
import type { TRPCRouterRecord } from "@trpc/server";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../../trpc";

export const adminRouter = {
	/** Hard purge — the terminal step of account deletion (grace period is
	 * user-facing, see user.deleteAccount). Sole-member orgs go too, with
	 * their Stripe subscriptions cancelled first since raw org deletes bypass
	 * beforeDeleteOrganization. Shared orgs get their seat quantity
	 * decremented here because the member-row FK cascade never fires
	 * afterRemoveMember. Deliberately silent — no removal or billing emails. */
	deleteUser: adminProcedure
		.input(z.object({ userId: z.string() }))
		.mutation(async ({ input }) => {
			const memberships = await db.query.members.findMany({
				where: eq(members.userId, input.userId),
			});
			for (const membership of memberships) {
				const [otherMembers] = await db
					.select({ value: count() })
					.from(members)
					.where(
						and(
							eq(members.organizationId, membership.organizationId),
							ne(members.userId, input.userId),
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
				await tx.delete(sessions).where(eq(sessions.userId, input.userId));
				await tx.delete(accounts).where(eq(accounts.userId, input.userId));
				await tx
					.delete(oauthAccessTokens)
					.where(eq(oauthAccessTokens.userId, input.userId));
				await tx
					.delete(oauthRefreshTokens)
					.where(eq(oauthRefreshTokens.userId, input.userId));
				await tx
					.delete(oauthConsents)
					.where(eq(oauthConsents.userId, input.userId));
				await tx.delete(members).where(eq(members.userId, input.userId));
				await tx
					.delete(teamMembers)
					.where(eq(teamMembers.userId, input.userId));
				await tx
					.delete(v2UsersHosts)
					.where(eq(v2UsersHosts.userId, input.userId));
				await tx.delete(v2Clients).where(eq(v2Clients.userId, input.userId));
				await tx
					.delete(userIdentities)
					.where(eq(userIdentities.userId, input.userId));

				// The row survives so authorship still resolves, but carries nothing
				// identifying. The email is rewritten rather than blanked so it is
				// released for re-registration without breaking the unique index.
				await tx
					.update(users)
					.set({
						deletedAt: new Date(),
						name: "Deleted user",
						email: `deleted+${input.userId}@deleted.invalid`,
						emailVerified: false,
						image: null,
						organizationIds: [],
					})
					.where(eq(users.id, input.userId));
			});
			return { success: true };
		}),

	/** Sets an email+password credential on the signed-in admin's own account
	 * through Better Auth's hasher (scrypt, salted — never write the
	 * accounts.password column directly), so OAuth-only accounts can also
	 * sign in with a password (e.g. mobile dev builds where OAuth is
	 * unavailable).
	 *
	 * Hand-composed because Better Auth has no upsert for this:
	 * `auth.api.setPassword` throws PASSWORD_ALREADY_SET on existing
	 * credentials, and the admin plugin's `setUserPassword` is update-only
	 * (and we don't run that plugin). Both endpoints internally use exactly
	 * these `context.password.hash` + `internalAdapter` calls. */
	setMyPassword: adminProcedure
		.input(z.object({ password: z.string().min(8) }))
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			const context = await auth.$context;
			const passwordHash = await context.password.hash(input.password);

			const credential = await db.query.accounts.findFirst({
				where: and(
					eq(accounts.userId, userId),
					eq(accounts.providerId, "credential"),
				),
			});
			if (credential) {
				await context.internalAdapter.updatePassword(userId, passwordHash);
			} else {
				await context.internalAdapter.createAccount({
					userId,
					providerId: "credential",
					accountId: userId,
					password: passwordHash,
				});
			}
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
