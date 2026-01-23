import { expo } from "@better-auth/expo";
import { stripe } from "@better-auth/stripe";
import { db } from "@superset/db/client";
import { members, subscriptions } from "@superset/db/schema";
import type { sessions } from "@superset/db/schema/auth";
import * as authSchema from "@superset/db/schema/auth";
import { OrganizationInvitationEmail } from "@superset/email/emails/organization-invitation";
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

				afterAddMember: async ({ organization }) => {
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
				},

				afterRemoveMember: async ({ organization }) => {
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
			},
		}),
		acceptInvitationEndpoint,
	],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
