import { expo } from "@better-auth/expo";
import { oauthProvider } from "@better-auth/oauth-provider";
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
import { Client } from "@upstash/qstash";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	apiKey,
	bearer,
	customSession,
	organization,
} from "better-auth/plugins";
import { jwt } from "better-auth/plugins/jwt";
import { and, count, desc, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { env } from "./env";
import { acceptInvitationEndpoint } from "./lib/accept-invitation-endpoint";
import { generateMagicTokenForInvite } from "./lib/generate-magic-token";
import { invitationRateLimit } from "./lib/rate-limit";
import { resend } from "./lib/resend";
import { stripeClient } from "./stripe";
import {
	formatPaymentFailed,
	formatPaymentSucceeded,
	formatPlanChanged,
	formatPrice,
	formatSubscriptionCancelled,
	formatSubscriptionStarted,
	getOrganizationOwners,
} from "./utils";

const qstash = new Client({ token: env.QSTASH_TOKEN });

const NOTIFY_SLACK_URL = `${env.NEXT_PUBLIC_API_URL}/api/integrations/stripe/jobs/notify-slack`;

export const auth = betterAuth({
	baseURL: env.NEXT_PUBLIC_API_URL,
	secret: env.BETTER_AUTH_SECRET,
	disabledPaths: ["/token"],
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
		...(env.NEXT_PUBLIC_DESKTOP_URL ? [env.NEXT_PUBLIC_DESKTOP_URL] : []),
		"superset://app",
		"superset://",
		...(process.env.NODE_ENV === "development"
			? ["exp://", "exp://**", "exp://192.168.*.*:*/**"]
			: []),
	],
	session: {
		expiresIn: 60 * 60 * 24 * 30,
		updateAge: 60 * 60 * 24,
		storeSessionInDatabase: true,
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5,
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
					const org = await auth.api.createOrganization({
						body: {
							name: `${user.name}'s Team`,
							slug: `${user.id.slice(0, 8)}-team`,
							userId: user.id,
						},
					});

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
		apiKey({
			enableMetadata: true,
			enableSessionForAPIKeys: true,
			defaultPrefix: "sk_live_",
		}),
		jwt({
			jwks: {
				keyPairConfig: { alg: "RS256" },
			},
			jwt: {
				issuer: env.NEXT_PUBLIC_API_URL,
				audience: env.NEXT_PUBLIC_API_URL,
				expirationTime: "1h",
			},
		}),
		oauthProvider({
			loginPage: `${env.NEXT_PUBLIC_WEB_URL}/sign-in`,
			consentPage: `${env.NEXT_PUBLIC_WEB_URL}/oauth/consent`,
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			validAudiences: [env.NEXT_PUBLIC_API_URL, `${env.NEXT_PUBLIC_API_URL}/`],
			silenceWarnings: {
				oauthAuthServerConfig: true,
				openidConfig: true,
			},
			postLogin: {
				// Org selection is handled in the consent page, so never redirect to a separate page
				page: `${env.NEXT_PUBLIC_WEB_URL}/oauth/consent`,
				shouldRedirect: () => false,
				consentReferenceId: ({ session }) => {
					const activeOrganizationId = (
						session as { activeOrganizationId?: string }
					).activeOrganizationId;
					if (!activeOrganizationId) {
						throw new Error("Organization must be selected before consent");
					}
					return activeOrganizationId;
				},
			},
			customAccessTokenClaims: ({ referenceId }) => ({
				organizationId: referenceId ?? undefined,
			}),
		}),
		expo(),
		organization({
			creatorRole: "owner",
			invitationExpiresIn: 60 * 60 * 24 * 7,
			sendInvitationEmail: async (data) => {
				const token = await generateMagicTokenForInvite({
					email: data.email,
				});

				const inviteLink = `${env.NEXT_PUBLIC_WEB_URL}/accept-invitation/${data.id}?token=${token}`;

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

					await resend.emails.send({
						from: "Superset <noreply@superset.sh>",
						to: user.email,
						subject: `You've been added to ${organization.name}`,
						react: MemberAddedEmail({
							memberName: user.name,
							organizationName: organization.name,
							role: member.role,
							addedByName: "A team admin",
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

					const owners = await getOrganizationOwners(organization.id);
					const pricePerSeat = stripeSub.items.data[0]?.price?.unit_amount ?? 0;
					const currency = stripeSub.items.data[0]?.price?.currency ?? "usd";
					const newMonthlyTotal = formatPrice(
						pricePerSeat * quantity,
						currency,
					);

					await resend.batch.send(
						owners.map((owner) => ({
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
						})),
					);
				},

				afterRemoveMember: async ({ user, organization }) => {
					await resend.emails.send({
						from: "Superset <noreply@superset.sh>",
						to: user.email,
						subject: `You've been removed from ${organization.name}`,
						react: MemberRemovedEmail({
							memberName: user.name,
							organizationName: organization.name,
							removedByName: "A team admin",
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

					const owners = await getOrganizationOwners(organization.id);
					const pricePerSeat = stripeSub.items.data[0]?.price?.unit_amount ?? 0;
					const currency = stripeSub.items.data[0]?.price?.currency ?? "usd";
					const newMonthlyTotal = formatPrice(
						pricePerSeat * quantity,
						currency,
					);

					await resend.batch.send(
						owners.map((owner) => ({
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
						})),
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
							eq(members.userId, session.userId ?? user.id),
							eq(members.organizationId, activeOrganizationId),
						)
					: eq(members.userId, session.userId ?? user.id),
				orderBy: desc(members.createdAt),
			});

			if (!activeOrganizationId && membership?.organizationId) {
				activeOrganizationId = membership.organizationId;
				await db
					.update(authSchema.sessions)
					.set({ activeOrganizationId })
					.where(eq(authSchema.sessions.id, session.id));
			}

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
					const org = await db.query.organizations.findFirst({
						where: eq(authSchema.organizations.id, subscription.referenceId),
					});

					if (!org) return;

					const owners = await getOrganizationOwners(subscription.referenceId);

					const interval = stripeSubscription.items.data[0]?.price?.recurring
						?.interval as "month" | "year" | undefined;
					const billingInterval = interval === "year" ? "yearly" : "monthly";

					const pricePerSeat =
						stripeSubscription.items.data[0]?.price?.unit_amount ?? 0;
					const currency =
						stripeSubscription.items.data[0]?.price?.currency ?? "usd";
					const amount = formatPrice(pricePerSeat, currency);

					await resend.batch.send(
						owners.map((owner) => ({
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
						})),
					);

					try {
						await qstash.publishJSON({
							url: NOTIFY_SLACK_URL,
							body: {
								eventType: "subscription_started",
								blocks: formatSubscriptionStarted({
									organizationName: org.name,
									planName: plan.name,
									billingInterval,
									amount,
									seatCount: subscription.seats ?? 1,
								}),
							},
							retries: 3,
						});
					} catch (error) {
						console.error(
							"[stripe/subscription-complete] Failed to queue Slack notification:",
							error,
						);
					}
				},

				onSubscriptionCancel: async ({ subscription }) => {
					const org = await db.query.organizations.findFirst({
						where: eq(authSchema.organizations.id, subscription.referenceId),
					});

					if (!org?.stripeCustomerId) return;

					const owners = await getOrganizationOwners(subscription.referenceId);
					const accessEndsAt = subscription.periodEnd ?? new Date();

					const portalSession =
						await stripeClient.billingPortal.sessions.create({
							customer: org.stripeCustomerId,
							return_url: env.NEXT_PUBLIC_WEB_URL,
						});

					await resend.batch.send(
						owners.map((owner) => ({
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
						})),
					);

					try {
						await qstash.publishJSON({
							url: NOTIFY_SLACK_URL,
							body: {
								eventType: "subscription_cancelled",
								blocks: formatSubscriptionCancelled({
									organizationName: org.name,
									planName: subscription.plan,
									accessEndsAt,
								}),
							},
							retries: 3,
						});
					} catch (error) {
						console.error(
							"[stripe/subscription-cancel] Failed to queue Slack notification:",
							error,
						);
					}
				},

				onEvent: async (event: Stripe.Event) => {
					if (event.type === "invoice.payment_failed") {
						const invoice = event.data.object as Stripe.Invoice;

						const customerId =
							typeof invoice.customer === "string"
								? invoice.customer
								: invoice.customer?.id;

						if (!customerId) return;

						const org = await db.query.organizations.findFirst({
							where: eq(authSchema.organizations.stripeCustomerId, customerId),
						});

						if (!org?.stripeCustomerId) return;

						const subscription = await db.query.subscriptions.findFirst({
							where: eq(subscriptions.referenceId, org.id),
						});

						const owners = await getOrganizationOwners(org.id);
						const amount = formatPrice(invoice.amount_due, invoice.currency);

						const portalSession =
							await stripeClient.billingPortal.sessions.create({
								customer: org.stripeCustomerId,
								return_url: env.NEXT_PUBLIC_WEB_URL,
							});

						await resend.batch.send(
							owners.map((owner) => ({
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
							})),
						);

						try {
							await qstash.publishJSON({
								url: NOTIFY_SLACK_URL,
								body: {
									eventType: "payment_failed",
									blocks: formatPaymentFailed({
										organizationName: org.name,
										planName: subscription?.plan ?? "Pro",
										amount,
									}),
								},
								retries: 3,
							});
						} catch (error) {
							console.error(
								"[stripe/payment-failed] Failed to queue Slack notification:",
								error,
							);
						}
					}

					if (event.type === "invoice.paid") {
						const invoice = event.data.object as Stripe.Invoice;

						const customerId =
							typeof invoice.customer === "string"
								? invoice.customer
								: invoice.customer?.id;

						if (!customerId) return;

						const org = await db.query.organizations.findFirst({
							where: eq(authSchema.organizations.stripeCustomerId, customerId),
						});

						if (!org) return;

						const subscription = await db.query.subscriptions.findFirst({
							where: eq(subscriptions.referenceId, org.id),
						});

						const amount = formatPrice(invoice.amount_paid, invoice.currency);
						const periodStart = invoice.period_start
							? new Date(invoice.period_start * 1000).toLocaleDateString(
									"en-US",
									{ month: "short", day: "numeric", year: "numeric" },
								)
							: "N/A";
						const periodEnd = invoice.period_end
							? new Date(invoice.period_end * 1000).toLocaleDateString(
									"en-US",
									{ month: "short", day: "numeric", year: "numeric" },
								)
							: "N/A";

						try {
							await qstash.publishJSON({
								url: NOTIFY_SLACK_URL,
								body: {
									eventType: "payment_succeeded",
									blocks: formatPaymentSucceeded({
										organizationName: org.name,
										planName: subscription?.plan ?? "Pro",
										amount,
										periodStart,
										periodEnd,
									}),
								},
								retries: 3,
							});
						} catch (error) {
							console.error(
								"[stripe/payment-succeeded] Failed to queue Slack notification:",
								error,
							);
						}
					}

					if (event.type === "customer.subscription.updated") {
						const stripeSubscription = event.data.object as Stripe.Subscription;
						const previousAttributes = event.data.previous_attributes as
							| Partial<Stripe.Subscription>
							| undefined;

						const previousPriceId =
							previousAttributes?.items?.data?.[0]?.price?.id;
						const currentPriceId = stripeSubscription.items.data[0]?.price?.id;

						if (!previousPriceId || previousPriceId === currentPriceId) return;

						const customerId =
							typeof stripeSubscription.customer === "string"
								? stripeSubscription.customer
								: stripeSubscription.customer?.id;

						if (!customerId) return;

						const org = await db.query.organizations.findFirst({
							where: eq(authSchema.organizations.stripeCustomerId, customerId),
						});

						if (!org) return;

						const subscription = await db.query.subscriptions.findFirst({
							where: eq(subscriptions.referenceId, org.id),
						});

						const newPrice = stripeSubscription.items.data[0]?.price;
						const newAmount = formatPrice(
							newPrice?.unit_amount ?? 0,
							newPrice?.currency ?? "usd",
						);
						const newInterval =
							newPrice?.recurring?.interval === "year" ? "yearly" : "monthly";

						try {
							await qstash.publishJSON({
								url: NOTIFY_SLACK_URL,
								body: {
									eventType: "plan_changed",
									blocks: formatPlanChanged({
										organizationName: org.name,
										planName: subscription?.plan ?? "Pro",
										newAmount,
										newInterval,
									}),
								},
								retries: 3,
							});
						} catch (error) {
							console.error(
								"[stripe/plan-changed] Failed to queue Slack notification:",
								error,
							);
						}
					}
				},
			},
		}),
		acceptInvitationEndpoint,
	],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
