import { COMPANY } from "@superset/shared/constants";
import type { Autumn } from "autumn-js";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { SEATS_FEATURE_ID } from "../autumn/features";
import { autumnPlanIdFor } from "./plan-ids";

export const BILLING_ERROR_CODES = {
	SUBSCRIPTION_NOT_FOUND: "Subscription not found",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Subscription plan not found",
	ALREADY_SUBSCRIBED_PLAN: "You're already subscribed to this plan",
	SUBSCRIPTION_NOT_ACTIVE: "Subscription is not active",
	SUBSCRIPTION_NOT_PENDING_CHANGE:
		"Subscription has no pending cancellation or scheduled plan change",
} as const;

export const ENTERPRISE_CHECKOUT_MESSAGE = `Enterprise subscriptions are managed by admins. Contact ${COMPANY.SUPPORT_EMAIL}.`;

function billingError(code: keyof typeof BILLING_ERROR_CODES): APIError {
	return new APIError("BAD_REQUEST", {
		code,
		message: BILLING_ERROR_CODES[code],
	});
}

export interface LiveSubscription {
	plan: string;
	status: string;
	billingInterval: string | null;
	cancelAtPeriodEnd: boolean | null;
	cancelAt: Date | null;
	stripeSubscriptionId: string | null;
	stripeCustomerId: string | null;
	stripeScheduleId: string | null;
}

export interface StripeSubscriptionRef {
	stripeCustomerId: string;
	stripeSubscriptionId: string;
	stripeScheduleId: string | null;
}

type AutumnBilling = Autumn["billing"];

export interface AutumnBillingDeps {
	attach(
		params: Parameters<AutumnBilling["attach"]>[0],
	): Promise<Pick<Awaited<ReturnType<AutumnBilling["attach"]>>, "paymentUrl">>;
	update(params: Parameters<AutumnBilling["update"]>[0]): Promise<unknown>;
	managedByAutumn(organizationId: string): Promise<boolean>;
	cancelPortalUrl(
		subscription: StripeSubscriptionRef,
		returnUrl: string,
	): Promise<string>;
	switchIntervalPortalUrl(
		subscription: StripeSubscriptionRef,
		annual: boolean,
		returnUrl: string,
	): Promise<string>;
	restoreInStripe(subscription: StripeSubscriptionRef): Promise<void>;
	ensureCustomer(organizationId: string): Promise<unknown>;
	currentPlanId(organizationId: string): Promise<string | null>;
	findLiveSubscription(
		organizationId: string,
	): Promise<LiveSubscription | null>;
	countBillableSeats(organizationId: string): Promise<number>;
	sync(organizationId: string): Promise<void>;
	handleStripeWebhook(request: Request): Promise<void>;
	completeCheckout(checkoutSessionId: string): Promise<void>;
}

export interface UpgradeBody {
	plan: string;
	annual?: boolean;
	successUrl: string;
	cancelUrl: string;
	returnUrl?: string;
	disableRedirect: boolean;
}

/** @deprecated Part of the Stripe-routes shim; see withAutumnBilling. */
export function checkoutSuccessUrl(
	baseURL: string,
	successUrl: string,
): string {
	return `${baseURL}/subscription/success?callbackURL=${encodeURIComponent(successUrl)}&checkoutSessionId={CHECKOUT_SESSION_ID}`;
}

/** @deprecated Part of the Stripe-routes shim; see withAutumnBilling. */
export async function upgradeWithAutumn(
	deps: AutumnBillingDeps,
	args: {
		userId: string;
		referenceId: string;
		body: UpgradeBody;
		baseURL: string;
	},
): Promise<{ url: string; redirect: boolean }> {
	const { body, referenceId } = args;
	if (body.plan === "enterprise") {
		throw new APIError("BAD_REQUEST", {
			message: ENTERPRISE_CHECKOUT_MESSAGE,
		});
	}
	if (body.plan !== "pro") throw billingError("SUBSCRIPTION_PLAN_NOT_FOUND");
	const annual = body.annual ?? false;
	const live = await deps.findLiveSubscription(referenceId);
	if (
		live?.status === "active" &&
		live.plan === "pro" &&
		(live.billingInterval === "year") === annual
	) {
		throw billingError("ALREADY_SUBSCRIBED_PLAN");
	}
	const legacy = live && stripeRef(live);
	if (legacy && !(await deps.managedByAutumn(referenceId))) {
		return {
			url: await deps.switchIntervalPortalUrl(
				legacy,
				annual,
				body.returnUrl ?? body.successUrl,
			),
			redirect: !body.disableRedirect,
		};
	}
	await deps.ensureCustomer(referenceId);
	const seats = Math.max(1, await deps.countBillableSeats(referenceId));
	const { paymentUrl } = await deps.attach({
		customerId: referenceId,
		planId: autumnPlanIdFor(annual),
		featureQuantities: [{ featureId: SEATS_FEATURE_ID, quantity: seats }],
		successUrl: checkoutSuccessUrl(args.baseURL, body.successUrl),
		redirectMode: "always",
		checkoutSessionParams: {
			cancel_url: body.cancelUrl,
			allow_promotion_codes: !annual,
			billing_address_collection: "required",
			tax_id_collection: { enabled: true },
			customer_update: { name: "auto", address: "auto" },
			metadata: { organizationId: referenceId, initiatedByUserId: args.userId },
			subscription_data: {
				metadata: { organizationId: referenceId, userId: args.userId },
			},
		},
	});
	if (!paymentUrl) await deps.sync(referenceId);
	return {
		url: paymentUrl ?? body.returnUrl ?? body.successUrl,
		redirect: !body.disableRedirect,
	};
}

function stripeRef(live: LiveSubscription): StripeSubscriptionRef | null {
	if (!live.stripeCustomerId || !live.stripeSubscriptionId) return null;
	return {
		stripeCustomerId: live.stripeCustomerId,
		stripeSubscriptionId: live.stripeSubscriptionId,
		stripeScheduleId: live.stripeScheduleId,
	};
}

/** @deprecated Part of the Stripe-routes shim; see withAutumnBilling. */
export async function cancelWithAutumn(
	deps: AutumnBillingDeps,
	args: {
		referenceId: string;
		body: { returnUrl: string; disableRedirect: boolean };
	},
): Promise<{ url: string; redirect: boolean }> {
	const live = await deps.findLiveSubscription(args.referenceId);
	const subscription = live && stripeRef(live);
	if (!subscription) throw billingError("SUBSCRIPTION_NOT_FOUND");
	return {
		url: await deps.cancelPortalUrl(subscription, args.body.returnUrl),
		redirect: !args.body.disableRedirect,
	};
}

/** @deprecated Part of the Stripe-routes shim; see withAutumnBilling. */
export async function restoreWithAutumn(
	deps: AutumnBillingDeps,
	args: { referenceId: string },
): Promise<{
	id: string | null;
	status: string;
	cancel_at_period_end: false;
	cancel_at: null;
}> {
	const live = await deps.findLiveSubscription(args.referenceId);
	const subscription = live && stripeRef(live);
	if (!live || !subscription) throw billingError("SUBSCRIPTION_NOT_FOUND");
	if (live.status !== "active" && live.status !== "trialing") {
		throw billingError("SUBSCRIPTION_NOT_ACTIVE");
	}
	if (!live.cancelAtPeriodEnd && !live.cancelAt && !live.stripeScheduleId) {
		throw billingError("SUBSCRIPTION_NOT_PENDING_CHANGE");
	}
	const planId = await deps.currentPlanId(args.referenceId);
	if (planId) {
		await deps.update({
			customerId: args.referenceId,
			planId,
			cancelAction: "uncancel",
		});
	} else {
		await deps.restoreInStripe(subscription);
	}
	await deps.sync(args.referenceId);
	return {
		id: live.stripeSubscriptionId,
		status: live.status,
		cancel_at_period_end: false,
		cancel_at: null,
	};
}

interface StripePluginShape {
	endpoints: {
		stripeWebhook: unknown;
		upgradeSubscription?: unknown;
		subscriptionSuccess?: unknown;
		cancelSubscription?: unknown;
		restoreSubscription?: unknown;
	};
}

interface ExistingEndpoint {
	path: string;
	options: { method: "GET" | "POST"; use?: unknown[] } & Record<
		string,
		unknown
	>;
}

const injectedMiddlewareCount =
	(
		createAuthEndpoint(
			"/autumn-billing/probe",
			{ method: "GET" },
			async () => null,
		).options as { use?: unknown[] }
	).use?.length ?? 0;

function sameRoute(endpoint: unknown): ExistingEndpoint {
	const { path, options } = endpoint as ExistingEndpoint;
	return {
		path,
		options: {
			...options,
			use: options.use?.slice(0, options.use.length - injectedMiddlewareCount),
		},
	};
}

interface ReferencedContext {
	body: Record<string, unknown>;
	context: {
		baseURL: string;
		referenceId: string;
		session: { user: { id: string } };
	};
}

/**
 * @deprecated Serves the Stripe plugin's /subscription/* routes from Autumn
 * for released clients.
 */
// TODO(2027-01-31): drop once MINIMUM_DESKTOP_VERSION is at or past the first build on /api/auth/autumn/*.
export function withAutumnBilling<Plugin extends StripePluginShape>(
	plugin: Plugin,
	options: { enabled: boolean; deps: () => AutumnBillingDeps },
): Plugin {
	if (!options.enabled) return plugin;
	const { endpoints } = plugin;
	const upgrade = sameRoute(endpoints.upgradeSubscription);
	const cancel = sameRoute(endpoints.cancelSubscription);
	const restore = sameRoute(endpoints.restoreSubscription);
	const webhook = sameRoute(endpoints.stripeWebhook);
	const success = sameRoute(endpoints.subscriptionSuccess);
	return {
		...plugin,
		endpoints: {
			...endpoints,
			upgradeSubscription: createAuthEndpoint(
				upgrade.path,
				upgrade.options,
				async (ctx) => {
					const { body, context } = ctx as unknown as ReferencedContext;
					return ctx.json(
						await upgradeWithAutumn(options.deps(), {
							userId: context.session.user.id,
							referenceId: context.referenceId,
							body: body as unknown as UpgradeBody,
							baseURL: context.baseURL,
						}),
					);
				},
			),
			cancelSubscription: createAuthEndpoint(
				cancel.path,
				cancel.options,
				async (ctx) => {
					const { body, context } = ctx as unknown as ReferencedContext;
					return ctx.json(
						await cancelWithAutumn(options.deps(), {
							referenceId: context.referenceId,
							body: body as { returnUrl: string; disableRedirect: boolean },
						}),
					);
				},
			),
			restoreSubscription: createAuthEndpoint(
				restore.path,
				restore.options,
				async (ctx) => {
					const { context } = ctx as unknown as ReferencedContext;
					return ctx.json(
						await restoreWithAutumn(options.deps(), {
							referenceId: context.referenceId,
						}),
					);
				},
			),
			subscriptionSuccess: createAuthEndpoint(
				success.path,
				success.options,
				async (ctx) => {
					const query = (ctx.query ?? {}) as {
						callbackURL?: string;
						checkoutSessionId?: string;
					};
					const callbackURL = query.callbackURL || "/";
					if (query.checkoutSessionId) {
						await options
							.deps()
							.completeCheckout(query.checkoutSessionId)
							.catch((error) =>
								console.error("[billing/checkout-success] sync failed", error),
							);
					}
					throw ctx.redirect(callbackURL);
				},
			),
			stripeWebhook: createAuthEndpoint(
				webhook.path,
				webhook.options,
				async (ctx) => {
					if (!ctx.request) {
						throw new APIError("BAD_REQUEST", {
							message: "Request body is required",
						});
					}
					await options.deps().handleStripeWebhook(ctx.request);
					return ctx.json({ success: true });
				},
			),
		},
	};
}
