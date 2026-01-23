import { expo } from "@better-auth/expo";
import { stripe } from "@better-auth/stripe";
import { db } from "@superset/db/client";
import { members, subscriptions } from "@superset/db/schema";
import type { sessions } from "@superset/db/schema/auth";
import * as authSchema from "@superset/db/schema/auth";
import { MemberAddedEmail } from "@superset/email/emails/member-added";
import { MemberAddedBillingEmail } from "@superset/email/emails/member-added-billing";
import { MemberRemovedEmail } from "@superset/email/emails/member-removed";
import { MemberRemovedBillingEmail } from "@superset/email/emails/member-removed-billing";
import { OrganizationInvitationEmail } from "@superset/email/emails/organization-invitation";
import { PaymentFailedEmail } from "@superset/email/emails/payment-failed";
import { SubscriptionCancelledEmail } from "@superset/email/emails/subscription-cancelled";
import { SubscriptionStartedEmail } from "@superset/email/emails/subscription-started";
import { canInvite, type OrganizationRole } from "@superset/shared/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, customSession, organization } from "better-auth/plugins";
import { and, count, eq } from "drizzle-orm";
import Stripe from "stripe";
import { env } from "./env";
import { acceptInvitationEndpoint } from "./lib/accept-invitation-endpoint";
import { generateMagicTokenForInvite } from "./lib/generate-magic-token";
import { invitationRateLimit } from "./lib/rate-limit";
import { resend } from "./lib/resend";

const stripeClient = new Stripe(env.STRIPE_SECRET_KEY);

// Helper to get organization owners
async function getOrganizationOwners(organizationId: string) {
	const ownerMembers = await db.query.members.findMany({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.role, "owner"),
		),
	});

	const owners = await Promise.all(
		ownerMembers.map(async (member) => {
			const user = await db.query.users.findFirst({
				where: eq(authSchema.users.id, member.userId),
			});
			return user;
		}),
	);

	return owners.filter((owner) => owner !== undefined);
}

// Helper to format price from Stripe subscription
function formatPrice(amountInCents: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amountInCents / 100);
}

export const auth = betterAuth({
	baseURL: env.NEXT_PUBLIC_API_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: "pg",
		usePlural: true,
		schema: { ...authSchema, subscriptions },
	}),
	trustedOrigins: [
		env.NEXT_PUBLIC_WEB_URL,
		env.NEXT_PUBLIC_API_URL,
		env.NEXT_PUBLIC_MARKETING_URL,
		env.NEXT_PUBLIC_ADMIN_URL,
		// Electron desktop app origins
		...(env.NEXT_PUBLIC_DESKTOP_URL ? [env.NEXT_PUBLIC_DESKTOP_URL] : []), // Dev: http://localhost:5927
		"superset://app", // Production Electron app
		// React Native mobile app origins
		"superset://", // Production mobile app
		// Expo development mode - exp:// scheme with local IP ranges
		...(process.env.NODE_ENV === "development"
			? [
					"exp://", // Trust all Expo URLs (prefix matching)
					"exp://**", // Trust all Expo URLs (wildcard matching)
					"exp://192.168.*.*:*/**", // Trust 192.168.x.x IP range with any port and path
				]
			: []),
	],
	session: {
		expiresIn: 60 * 60 * 24 * 30, // 30 days
		updateAge: 60 * 60 * 24, // refresh daily on activity
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5, // 5 minutes
		},
	},
	advanced: {
		crossSubDomainCookies: {
			enabled: true,
			domain: env.NEXT_PUBLIC_COOKIE_DOMAIN,
		},
		database: {
			generateId: false,
		},
	},
	socialProviders: {
		github: {
			clientId: env.GH_CLIENT_ID,
			clientSecret: env.GH_CLIENT_SECRET,
		},
		google: {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
		},
	},
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					// Create organization for new user
					const org = await auth.api.createOrganization({
						body: {
							name: `${user.name}'s Team`,
							slug: `${user.id.slice(0, 8)}-team`,
							userId: user.id,
						},
					});

					// Update all sessions for this user to set the active organization
					// This handles sessions created during signup before the org existed
					if (org?.id) {
						await db
							.update(authSchema.sessions)
							.set({ activeOrganizationId: org.id })
							.where(eq(authSchema.sessions.userId, user.id));
					}
				},
			},
		},
	},
	plugins: [
		expo(),
		organization({
			creatorRole: "owner",
			invitationExpiresIn: 60 * 60 * 24 * 7, // 1 week
			sendInvitationEmail: async (data) => {
				// Generate magic token for this invitation
				const token = await generateMagicTokenForInvite({
					email: data.email,
				});

				// Construct invitation link with magic token
				const inviteLink = `${env.NEXT_PUBLIC_WEB_URL}/accept-invitation/${data.id}?token=${token}`;

				// Check if user already exists to personalize greeting
				const existingUser = await db.query.users.findFirst({
					where: eq(authSchema.users.email, data.email),
				});

				await resend.emails.send({
					from: "Superset <noreply@superset.sh>",
					to: data.email,
					subject: `${data.inviter.user.name} invited you to join ${data.organization.name}`,
					react: OrganizationInvitationEmail({
						organizationName: data.organization.name,
						inviterName: data.inviter.user.name,
						inviteLink,
						role: data.role,
						inviteeName: existingUser?.name ?? null,
						inviterEmail: data.inviter.user.email,
						expiresAt: data.invitation.expiresAt,
					}),
				});
			},
			organizationHooks: {
				beforeCreateInvitation: async (data) => {
					const { inviterId, organizationId, role } = data.invitation;

					// Rate limiting: 10 invitations per hour per user
					const { success } = await invitationRateLimit.limit(inviterId);
					if (!success) {
						throw new Error(
							"Rate limit exceeded. Max 10 invitations per hour.",
						);
					}

					const inviterMember = await db.query.members.findFirst({
						where: and(
							eq(members.userId, inviterId),
							eq(members.organizationId, organizationId),
						),
					});

					if (!inviterMember) {
						throw new Error("Not a member of this organization");
					}

					if (
						!canInvite(
							inviterMember.role as OrganizationRole,
							role as OrganizationRole,
						)
					) {
						throw new Error("Cannot invite users with this role");
					}
				},

				afterCreateOrganization: async ({ organization, user }) => {
					const customer = await stripeClient.customers.create({
						name: organization.name,
						email: user.email,
						metadata: {
							organizationId: organization.id,
							organizationSlug: organization.slug,
						},
					});

					await db
						.update(authSchema.organizations)
						.set({ stripeCustomerId: customer.id })
						.where(eq(authSchema.organizations.id, organization.id));
				},

				beforeDeleteOrganization: async ({ organization }) => {
					if (!organization.stripeCustomerId) return;

					const subs = await stripeClient.subscriptions.list({
						customer: organization.stripeCustomerId,
						status: "active",
					});
					for (const sub of subs.data) {
						await stripeClient.subscriptions.cancel(sub.id);
					}
				},

				afterUpdateOrganization: async ({ organization }) => {
					if (!organization?.stripeCustomerId) return;

					await stripeClient.customers.update(organization.stripeCustomerId, {
						name: organization.name,
					});
				},

				beforeAddMember: async ({ organization }) => {
					const subscription = await db.query.subscriptions.findFirst({
						where: and(
							eq(subscriptions.referenceId, organization.id),
							eq(subscriptions.status, "active"),
						),
					});

					if (subscription) return;

					const memberCount = await db
						.select({ count: count() })
						.from(members)
						.where(eq(members.organizationId, organization.id));

					const currentCount = memberCount[0]?.count ?? 0;

					if (currentCount >= 1) {
						throw new Error(
							"Free plan is limited to 1 user. Upgrade to add more members.",
						);
					}
				},

				afterAddMember: async ({ member, user, organization }) => {
					const subscription = await db.query.subscriptions.findFirst({
						where: and(
							eq(subscriptions.referenceId, organization.id),
							eq(subscriptions.status, "active"),
						),
					});

					// Send welcome email to the new member
					await resend.emails.send({
						from: "Superset <noreply@superset.sh>",
						to: user.email,
						subject: `You've been added to ${organization.name}`,
						react: MemberAddedEmail({
							memberName: user.name,
							organizationName: organization.name,
							role: member.role,
							addedByName: "A team admin", // Hook doesn't provide who added them
							dashboardLink: env.NEXT_PUBLIC_WEB_URL,
						}),
					});

					if (!subscription?.stripeSubscriptionId) return;

					const memberCount = await db
						.select({ count: count() })
						.from(members)
						.where(eq(members.organizationId, organization.id));

					const quantity = memberCount[0]?.count ?? 1;

					const stripeSub = await stripeClient.subscriptions.retrieve(
						subscription.stripeSubscriptionId,
					);
					const itemId = stripeSub.items.data[0]?.id;

					if (itemId) {
						await stripeClient.subscriptions.update(
							subscription.stripeSubscriptionId,
							{
								items: [{ id: itemId, quantity }],
								proration_behavior: "create_prorations",
							},
						);
					}

					// Send billing update email to owners
					const owners = await getOrganizationOwners(organization.id);
					const pricePerSeat =
						stripeSub.items.data[0]?.price?.unit_amount ?? 0;
					const currency = stripeSub.items.data[0]?.price?.currency ?? "usd";
					const newMonthlyTotal = formatPrice(pricePerSeat * quantity, currency);

					await Promise.all(
						owners.map((owner) =>
							resend.emails.send({
								from: "Superset <noreply@superset.sh>",
								to: owner.email,
								subject: `Billing update: New member added to ${organization.name}`,
								react: MemberAddedBillingEmail({
									ownerName: owner.name,
									organizationName: organization.name,
									newMemberName: user.name ?? "New member",
									newMemberEmail: user.email,
									addedByName: "A team admin",
									newSeatCount: quantity,
									newMonthlyTotal,
								}),
							}),
						),
					);
				},

				afterRemoveMember: async ({ user, organization }) => {
					// Send notification to removed member
					await resend.emails.send({
						from: "Superset <noreply@superset.sh>",
						to: user.email,
						subject: `You've been removed from ${organization.name}`,
						react: MemberRemovedEmail({
							memberName: user.name,
							organizationName: organization.name,
							removedByName: "A team admin", // Hook doesn't provide who removed them
						}),
					});

					const subscription = await db.query.subscriptions.findFirst({
						where: and(
							eq(subscriptions.referenceId, organization.id),
							eq(subscriptions.status, "active"),
						),
					});

					if (!subscription?.stripeSubscriptionId) return;

					const memberCount = await db
						.select({ count: count() })
						.from(members)
						.where(eq(members.organizationId, organization.id));

					const quantity = Math.max(1, memberCount[0]?.count ?? 1);

					const stripeSub = await stripeClient.subscriptions.retrieve(
						subscription.stripeSubscriptionId,
					);
					const itemId = stripeSub.items.data[0]?.id;

					if (itemId) {
						await stripeClient.subscriptions.update(
							subscription.stripeSubscriptionId,
							{
								items: [{ id: itemId, quantity }],
								proration_behavior: "create_prorations",
							},
						);
					}

					// Send billing update email to owners
					const owners = await getOrganizationOwners(organization.id);
					const pricePerSeat =
						stripeSub.items.data[0]?.price?.unit_amount ?? 0;
					const currency = stripeSub.items.data[0]?.price?.currency ?? "usd";
					const newMonthlyTotal = formatPrice(pricePerSeat * quantity, currency);

					await Promise.all(
						owners.map((owner) =>
							resend.emails.send({
								from: "Superset <noreply@superset.sh>",
								to: owner.email,
								subject: `Billing update: Member removed from ${organization.name}`,
								react: MemberRemovedBillingEmail({
									ownerName: owner.name,
									organizationName: organization.name,
									removedMemberName: user.name ?? "Former member",
									removedMemberEmail: user.email,
									removedByName: "A team admin",
									newSeatCount: quantity,
									newMonthlyTotal,
								}),
							}),
						),
					);
				},
			},
		}),
		bearer(),
		customSession(async ({ user, session: baseSession }) => {
			const session = baseSession as typeof sessions.$inferSelect;

			let activeOrganizationId = session.activeOrganizationId;

			const membership = await db.query.members.findFirst({
				where: activeOrganizationId
					? and(
							eq(members.userId, session.userId),
							eq(members.organizationId, activeOrganizationId),
						)
					: eq(members.userId, session.userId),
			});

			if (!activeOrganizationId && membership?.organizationId) {
				activeOrganizationId = membership.organizationId;
				await db
					.update(authSchema.sessions)
					.set({ activeOrganizationId })
					.where(eq(authSchema.sessions.id, session.id));
			}

			// Get active subscription plan for the organization
			let plan: string | null = null;
			if (activeOrganizationId) {
				const subscription = await db.query.subscriptions.findFirst({
					where: and(
						eq(subscriptions.referenceId, activeOrganizationId),
						eq(subscriptions.status, "active"),
					),
				});
				plan = subscription?.plan ?? null;
			}

			return {
				user,
				session: {
					...session,
					activeOrganizationId,
					role: membership?.role,
					plan,
				},
			};
		}),
		stripe({
			stripeClient,
			stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
			createCustomerOnSignUp: false,

			subscription: {
				enabled: true,
				plans: [
					{
						name: "pro",
						priceId: env.STRIPE_PRO_MONTHLY_PRICE_ID,
						annualDiscountPriceId: env.STRIPE_PRO_YEARLY_PRICE_ID,
					},
				],

				authorizeReference: async ({ user, referenceId, action }) => {
					const member = await db.query.members.findFirst({
						where: and(
							eq(members.userId, user.id),
							eq(members.organizationId, referenceId),
						),
					});

					if (!member) return false;

					switch (action) {
						case "upgrade-subscription":
						case "cancel-subscription":
						case "restore-subscription":
							return member.role === "owner";
						case "list-subscription":
							return member.role === "owner" || member.role === "admin";
						default:
							return false;
					}
				},

				getCheckoutSessionParams: async ({ user, subscription }) => {
					const org = await db.query.organizations.findFirst({
						where: eq(
							authSchema.organizations.id,
							subscription?.referenceId ?? "",
						),
					});

					return {
						params: {
							customer: org?.stripeCustomerId ?? undefined,
							allow_promotion_codes: true,
							billing_address_collection: "required",
							metadata: {
								organizationId: org?.id ?? "",
								initiatedByUserId: user.id,
							},
						},
					};
				},

				onSubscriptionComplete: async ({
					subscription,
					stripeSubscription,
					plan,
				}) => {
					// Get organization info
					const org = await db.query.organizations.findFirst({
						where: eq(authSchema.organizations.id, subscription.referenceId),
					});

					if (!org) return;

					// Get owners to send email
					const owners = await getOrganizationOwners(subscription.referenceId);

					// Determine billing interval
					const interval = stripeSubscription.items.data[0]?.price?.recurring
						?.interval as "month" | "year" | undefined;
					const billingInterval =
						interval === "year" ? "yearly" : "monthly";

					// Get price info
					const pricePerSeat =
						stripeSubscription.items.data[0]?.price?.unit_amount ?? 0;
					const currency =
						stripeSubscription.items.data[0]?.price?.currency ?? "usd";
					const amount = formatPrice(pricePerSeat, currency);

					await Promise.all(
						owners.map((owner) =>
							resend.emails.send({
								from: "Superset <noreply@superset.sh>",
								to: owner.email,
								subject: `Welcome to Superset ${plan.name}!`,
								react: SubscriptionStartedEmail({
									ownerName: owner.name,
									organizationName: org.name,
									planName: plan.name,
									billingInterval,
									amount,
									seatCount: subscription.seats ?? 1,
								}),
							}),
						),
					);
				},

				onSubscriptionCancel: async ({
					subscription,
					stripeSubscription,
				}) => {
					// Get organization info
					const org = await db.query.organizations.findFirst({
						where: eq(authSchema.organizations.id, subscription.referenceId),
					});

					if (!org?.stripeCustomerId) return;

					// Get owners to send email
					const owners = await getOrganizationOwners(subscription.referenceId);

					// Get the end date from Stripe subscription
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const periodEnd = (stripeSubscription as any).current_period_end as
						| number
						| undefined;
					const accessEndsAt = periodEnd
						? new Date(periodEnd * 1000)
						: new Date();

					// Create billing portal session for resubscribe link
					const portalSession = await stripeClient.billingPortal.sessions.create(
						{
							customer: org.stripeCustomerId,
							return_url: env.NEXT_PUBLIC_WEB_URL,
						},
					);

					await Promise.all(
						owners.map((owner) =>
							resend.emails.send({
								from: "Superset <noreply@superset.sh>",
								to: owner.email,
								subject: `Your ${subscription.plan} subscription has been cancelled`,
								react: SubscriptionCancelledEmail({
									ownerName: owner.name,
									organizationName: org.name,
									planName: subscription.plan,
									accessEndsAt,
									billingPortalUrl: portalSession.url,
								}),
							}),
						),
					);
				},

				onEvent: async (event: Stripe.Event) => {
					// Handle payment failed events
					if (event.type === "invoice.payment_failed") {
						const invoice = event.data.object as {
							customer: string;
							amount_due: number;
							currency: string;
							subscription?: string;
						};

						// Find the organization by Stripe customer ID
						const org = await db.query.organizations.findFirst({
							where: eq(
								authSchema.organizations.stripeCustomerId,
								invoice.customer,
							),
						});

						if (!org?.stripeCustomerId) return;

						// Get subscription info
						const subscription = await db.query.subscriptions.findFirst({
							where: eq(subscriptions.referenceId, org.id),
						});

						// Get owners to send email
						const owners = await getOrganizationOwners(org.id);

						const amount = formatPrice(invoice.amount_due, invoice.currency);

						// Create billing portal session for updating payment method
						const portalSession = await stripeClient.billingPortal.sessions.create(
							{
								customer: org.stripeCustomerId,
								return_url: env.NEXT_PUBLIC_WEB_URL,
							},
						);

						await Promise.all(
							owners.map((owner) =>
								resend.emails.send({
									from: "Superset <noreply@superset.sh>",
									to: owner.email,
									subject: `Payment failed for ${org.name}`,
									react: PaymentFailedEmail({
										ownerName: owner.name,
										organizationName: org.name,
										planName: subscription?.plan ?? "Pro",
										amount,
										billingPortalUrl: portalSession.url,
									}),
								}),
							),
						);
					}
				},
			},
		}),
		acceptInvitationEndpoint,
	],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
