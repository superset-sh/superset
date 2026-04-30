import { apiKey } from "@better-auth/api-key";
import { expo } from "@better-auth/expo";
import { oauthProvider } from "@better-auth/oauth-provider";
import { stripe } from "@better-auth/stripe";
import { db } from "@superset/db/client";
import { members, subscriptions } from "@superset/db/schema";
import type { sessions } from "@superset/db/schema/auth";
import * as authSchema from "@superset/db/schema/auth";
import { seedDefaultStatuses } from "@superset/db/seed-default-statuses";
import { MemberAddedEmail } from "@superset/email/emails/member-added";
import { MemberAddedBillingEmail } from "@superset/email/emails/member-added-billing";
import { MemberRemovedEmail } from "@superset/email/emails/member-removed";
import { MemberRemovedBillingEmail } from "@superset/email/emails/member-removed-billing";
import { OrganizationInvitationEmail } from "@superset/email/emails/organization-invitation";
import { PaymentFailedEmail } from "@superset/email/emails/payment-failed";
import { SubscriptionCancelledEmail } from "@superset/email/emails/subscription-cancelled";
import { SubscriptionStartedEmail } from "@superset/email/emails/subscription-started";
import { canInvite, type OrganizationRole } from "@superset/shared/auth";
import { getTrustedVercelPreviewOrigins } from "@superset/shared/vercel-preview-origins";
import { Client } from "@upstash/qstash";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, customSession, organization } from "better-auth/plugins";
import { jwt } from "better-auth/plugins/jwt";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { env } from "./env";
import { acceptInvitationEndpoint } from "./lib/accept-invitation-endpoint";
import { generateMagicTokenForInvite } from "./lib/generate-magic-token";
import { invitationRateLimit } from "./lib/rate-limit";
import { resend } from "./lib/resend";
import {
	resolveSessionOrganizationState,
	type SessionOrganizationContext,
} from "./lib/resolve-session-organization-state";
import { stripeClient } from "./stripe";
import { formatPrice, getOrganizationOwners } from "./utils";

const qstash = new Client({ token: env.QSTASH_TOKEN });

const NOTIFY_SLACK_URL = `${env.NEXT_PUBLIC_API_URL}/api/integrations/stripe/jobs/notify-slack`;
const desktopDevPort = process.env.DESKTOP_VITE_PORT || "5173";
const desktopDevOrigins =
	process.env.NODE_ENV === "development"
		? [
				`http://localhost:${desktopDevPort}`,
				`http://127.0.0.1:${desktopDevPort}`,
			]
		: [];

export const auth = betterAuth({
	baseURL: env.NEXT_PUBLIC_API_URL,
	secret: env.BETTER_AUTH_SECRET,
	disabledPaths: [],
	database: drizzleAdapter(db, {
		provider: "pg",
		usePlural: true,
		schema: { ...authSchema, subscriptions },
	}),
	trustedOrigins: async (request) => [
		env.NEXT_PUBLIC_WEB_URL,
		env.NEXT_PUBLIC_API_URL,
		env.NEXT_PUBLIC_MARKETING_URL,
		env.NEXT_PUBLIC_ADMIN_URL,
		...(env.NEXT_PUBLIC_DESKTOP_URL ? [env.NEXT_PUBLIC_DESKTOP_URL] : []),
		...getTrustedVercelPreviewOrigins(request?.url ?? env.NEXT_PUBLIC_API_URL),
		...desktopDevOrigins,
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
					const domain = user.email.split("@")[1]?.toLowerCase();
					let enrolledOrgId: string | null = null;

					if (domain) {
						const matchingOrgs = await db.query.organizations.findMany({
							where: sql`${authSchema.organizations.allowedDomains} @> ARRAY[${domain}]::text[]`,
						});

						for (const org of matchingOrgs) {
							try {
								await auth.api.addMember({
									body: {
										organizationId: org.id,
										userId: user.id,
										role: "member",
									},
								});
								if (!enrolledOrgId) {
									enrolledOrgId = org.id;
								}
							} catch (error) {
								console.error(
									`[auto-enroll] Failed to add user ${user.id} to org ${org.id}:`,
									error,
								);
								// addMember may have created the DB record before a downstream error (e.g. Stripe) — check
								const memberExists = await db.query.members.findFirst({
									where: and(
										eq(authSchema.members.organizationId, org.id),
										eq(authSchema.members.userId, user.id),
									),
								});
								if (memberExists && !enrolledOrgId) {
									enrolledOrgId = org.id;
								}
							}
						}
					}

					if (!enrolledOrgId) {
						const personalOrg = await auth.api.createOrganization({
							body: {
								name: `${user.name}'s Team`,
								slug: `${user.id.slice(0, 8)}-team`,
								userId: user.id,
							},
						});
						enrolledOrgId = personalOrg?.id ?? null;
					}

					if (enrolledOrgId) {
						await db
							.update(authSchema.sessions)
							.set({ activeOrganizationId: enrolledOrgId })
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
			rateLimit: {
				enabled: false,
			},
		}),
		jwt({
			jwks: {
				keyPairConfig: { alg: "RS256" },
			},
			jwt: {
				issuer: env.NEXT_PUBLIC_API_URL,
				audience: env.NEXT_PUBLIC_API_URL,
				expirationTime: "1h",
				definePayload: async ({
					user,
				}: {
					user: { id: string; email: string };
					session: Record<string, unknown>;
				}) => {
					const userMemberships = await db.query.members.findMany({
						where: eq(members.userId, user.id),
						columns: { organizationId: true },
					});
					const organizationIds = [
						...new Set(userMemberships.map((m) => m.organizationId)),
					];
					return { sub: user.id, email: user.email, organizationIds };
				},
			},
		}),
		oauthProvider({
			loginPage: `${env.NEXT_PUBLIC_WEB_URL}/sign-in`,
			consentPage: `${env.NEXT_PUBLIC_WEB_URL}/oauth/consent`,
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			validAudiences: [
				env.NEXT_PUBLIC_API_URL,
				`${env.NEXT_PUBLIC_API_URL}/`,
				`${env.NEXT_PUBLIC_API_URL}/api/agent/mcp`,
				`${env.NEXT_PUBLIC_API_URL}/api/v2/agent/mcp`,
			],
			silenceWarnings: {
				oauthAuthServerConfig: true,
				openidConfig: true,
			},
			postLogin: {
				// Org selection is handled in the consent page, so never redirect to a separate page
				page: `${env.NEXT_PUBLIC_WEB_URL}/oauth/consent`,
				shouldRedirect: () => false,
				consentReferenceId: async ({ user, session }) => {
					const { activeOrganizationId } =
						await resolveSessionOrganizationState({
							userId: user?.id,
							session: session as SessionOrganizationContext | undefined,
						});
					return activeOrganizationId ?? undefined;
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
					invitationId: data.id,
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

					await seedDefaultStatuses(organization.id);
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

				beforeAddMember: async ({ organization, user }) => {
					// Domain-allowlisted users bypass the free-plan member limit.
					// If an admin put the user's domain in allowedDomains, they've
					// already explicitly opted in to letting those users join.
					// (allowedDomains isn't on the hook's organization arg because
					// it isn't declared as a better-auth additionalField — fetch it.)
					const userDomain = user.email.split("@")[1]?.toLowerCase();
					if (userDomain) {
						const orgRow = await db.query.organizations.findFirst({
							where: eq(authSchema.organizations.id, organization.id),
							columns: { allowedDomains: true },
						});
						if (orgRow?.allowedDomains?.includes(userDomain)) {
							return;
						}
					}

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

					// This email is invitation-specific. Auto-enroll and direct addMember
					// calls should not send the invite-style "you were added" message.
					const acceptedInvitation = await db.query.invitations.findFirst({
						where: and(
							eq(authSchema.invitations.organizationId, organization.id),
							eq(authSchema.invitations.email, user.email),
							eq(authSchema.invitations.status, "accepted"),
						),
						orderBy: desc(authSchema.invitations.createdAt),
					});

					if (acceptedInvitation) {
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
					}

					if (!subscription?.stripeSubscriptionId) return;
					if (subscription.plan === "enterprise") return;

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

					try {
						await qstash.publishJSON({
							url: NOTIFY_SLACK_URL,
							body: {
								eventType: "seat_added",
								stripeSubscriptionId: subscription.stripeSubscriptionId,
								memberName: user.name ?? "New member",
								previousSeats: quantity - 1,
								newSeats: quantity,
							},
							retries: 3,
						});
					} catch (error) {
						console.error(
							"[org/after-add-member] Failed to queue Slack notification:",
							error,
						);
					}
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
					if (subscription.plan === "enterprise") return;

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

					try {
						await qstash.publishJSON({
							url: NOTIFY_SLACK_URL,
							body: {
								eventType: "seat_removed",
								stripeSubscriptionId: subscription.stripeSubscriptionId,
								memberName: user.name ?? "Former member",
								previousSeats: quantity + 1,
								newSeats: quantity,
							},
							retries: 3,
						});
					} catch (error) {
						console.error(
							"[org/after-remove-member] Failed to queue Slack notification:",
							error,
						);
					}
				},
			},
		}),
		bearer(),
		customSession(async ({ user, session: baseSession }) => {
			const session = baseSession as typeof sessions.$inferSelect;
			const { activeOrganizationId, allMemberships, membership } =
				await resolveSessionOrganizationState({
					userId: session.userId ?? user.id,
					session,
				});

			const organizationIds = [
				...new Set(allMemberships.map((m) => m.organizationId)),
			];

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
					organizationIds,
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
					{
						name: "enterprise",
						priceId: env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID,
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

					if (
						action === "upgrade-subscription" ||
						action === "cancel-subscription" ||
						action === "restore-subscription"
					) {
						const subscription = await db.query.subscriptions.findFirst({
							where: and(
								eq(subscriptions.referenceId, referenceId),
								eq(subscriptions.status, "active"),
							),
						});
						if (subscription?.plan === "enterprise") return false;
					}

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

				getCheckoutSessionParams: async ({ user, plan, subscription }) => {
					if (plan.name === "enterprise") {
						throw new Error(
							"Enterprise subscriptions are managed by admins. Contact founders@superset.sh.",
						);
					}

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

					if (plan.name === "enterprise") return;

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
								stripeSubscriptionId: stripeSubscription.id,
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

				onSubscriptionCancel: async ({ subscription, stripeSubscription }) => {
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
								stripeSubscriptionId: stripeSubscription.id,
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

						const stripeSubId =
							subscription?.stripeSubscriptionId ??
							(invoice.parent?.subscription_details?.subscription as
								| string
								| undefined);

						if (stripeSubId) {
							try {
								await qstash.publishJSON({
									url: NOTIFY_SLACK_URL,
									body: {
										eventType: "payment_failed",
										stripeSubscriptionId: stripeSubId,
										amountCents: invoice.amount_due,
										currency: invoice.currency,
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
					}

					if (event.type === "invoice.paid") {
						const invoice = event.data.object as Stripe.Invoice;

						const stripeSubId = invoice.parent?.subscription_details
							?.subscription as string | undefined;

						if (stripeSubId) {
							try {
								await qstash.publishJSON({
									url: NOTIFY_SLACK_URL,
									body: {
										eventType: "payment_succeeded",
										stripeSubscriptionId: stripeSubId,
										amountCents: invoice.amount_paid,
										currency: invoice.currency,
										periodStart: invoice.period_start ?? 0,
										periodEnd: invoice.period_end ?? 0,
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

						const previousInterval =
							previousAttributes?.items?.data?.[0]?.price?.recurring
								?.interval === "year"
								? "yearly"
								: "monthly";

						try {
							await qstash.publishJSON({
								url: NOTIFY_SLACK_URL,
								body: {
									eventType: "plan_changed",
									stripeSubscriptionId: stripeSubscription.id,
									previousInterval,
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

/**
 * Mints a short-lived JWT signed with the same JWKS key the Better Auth JWT
 * plugin uses for session-derived tokens. Used by headless service code
 * (e.g. the automations dispatcher) that needs to act on behalf of a user
 * without holding their session cookie.
 *
 * The resulting token is accepted by anything that verifies via the public
 * JWKS endpoint (the relay and any other downstream service), because it is
 * signed with the same RS256 key pair.
 */
export async function mintUserJwt(args: {
	userId: string;
	email?: string;
	organizationIds: string[];
	scope?: string;
	runId?: string;
	/** Token lifetime in seconds. Default 300 (5 minutes). */
	ttlSeconds?: number;
}): Promise<string> {
	const exp = Math.floor(Date.now() / 1000) + (args.ttlSeconds ?? 300);

	const response = await auth.api.signJWT({
		body: {
			payload: {
				sub: args.userId,
				email: args.email,
				organizationIds: args.organizationIds,
				scope: args.scope,
				runId: args.runId,
				exp,
			},
		},
	});

	return response.token;
}
