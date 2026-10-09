import { APIError, createAuthEndpoint } from "better-auth/api";
import { autumnPlanIdFor, SEATS_FEATURE_ID } from "./plans";

export const BILLING_ERROR_CODES = {
	SUBSCRIPTION_NOT_FOUND: "Subscription not found",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Subscription plan not found",
	ALREADY_SUBSCRIBED_PLAN: "You're already subscribed to this plan",
	SUBSCRIPTION_NOT_ACTIVE: "Subscription is not active",
	SUBSCRIPTION_NOT_PENDING_CHANGE:
		"Subscription has no pending cancellation or scheduled plan change",
} as const;

export const ENTERPRISE_CHECKOUT_MESSAGE =
	"Enterprise subscriptions are managed by admins. Contact support@superset.sh.";

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
	stripeScheduleId: string | null;
}

export interface AutumnBillingDeps {
	attach(params: {
		customerId: string;
		planId: string;
		featureQuantities: { featureId: string; quantity: number }[];
		successUrl: string;
		redirectMode: "if_required";
		checkoutSessionParams: Record<string, unknown>;
	}): Promise<{ paymentUrl: string | null }>;
	update(params: {
		customerId: string;
		planId: string;
		cancelAction: "uncancel";
	}): Promise<unknown>;
	openCustomerPortal(params: {
		customerId: string;
		returnUrl: string;
	}): Promise<{ url: string }>;
	ensureCustomer(organizationId: string): Promise<unknown>;
	currentPlanId(organizationId: string): Promise<string | null>;
	findLiveSubscription(
		organizationId: string,
	): Promise<LiveSubscription | null>;
	countBillableSeats(organizationId: string): Promise<number>;
	sync(organizationId: string): Promise<void>;
}

export interface UpgradeBody {
	plan: string;
	annual?: boolean;
	successUrl: string;
	cancelUrl: string;
	returnUrl?: string;
	disableRedirect: boolean;
}

export async function upgradeWithAutumn(
	deps: AutumnBillingDeps,
	args: { userId: string; referenceId: string; body: UpgradeBody },
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
	await deps.ensureCustomer(referenceId);
	const seats = Math.max(1, await deps.countBillableSeats(referenceId));
	const { paymentUrl } = await deps.attach({
		customerId: referenceId,
		planId: autumnPlanIdFor(annual),
		featureQuantities: [{ featureId: SEATS_FEATURE_ID, quantity: seats }],
		successUrl: body.successUrl,
		redirectMode: "if_required",
		checkoutSessionParams: {
			cancel_url: body.cancelUrl,
			allow_promotion_codes: !annual,
			billing_address_collection: "required",
			metadata: { organizationId: referenceId, initiatedByUserId: args.userId },
		},
	});
	if (!paymentUrl) await deps.sync(referenceId);
	return {
		url: paymentUrl ?? body.returnUrl ?? body.successUrl,
		redirect: !body.disableRedirect,
	};
}

export async function cancelWithAutumn(
	deps: AutumnBillingDeps,
	args: {
		referenceId: string;
		body: { returnUrl: string; disableRedirect: boolean };
	},
): Promise<{ url: string; redirect: boolean }> {
	const live = await deps.findLiveSubscription(args.referenceId);
	if (!live) throw billingError("SUBSCRIPTION_NOT_FOUND");
	const { url } = await deps.openCustomerPortal({
		customerId: args.referenceId,
		returnUrl: args.body.returnUrl,
	});
	return { url, redirect: !args.body.disableRedirect };
}

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
	if (!live) throw billingError("SUBSCRIPTION_NOT_FOUND");
	if (live.status !== "active" && live.status !== "trialing") {
		throw billingError("SUBSCRIPTION_NOT_ACTIVE");
	}
	if (!live.cancelAtPeriodEnd && !live.cancelAt && !live.stripeScheduleId) {
		throw billingError("SUBSCRIPTION_NOT_PENDING_CHANGE");
	}
	const planId = await deps.currentPlanId(args.referenceId);
	if (!planId) throw billingError("SUBSCRIPTION_NOT_FOUND");
	await deps.update({
		customerId: args.referenceId,
		planId,
		cancelAction: "uncancel",
	});
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
		cancelSubscription?: unknown;
		restoreSubscription?: unknown;
	};
}

interface ExistingEndpoint {
	path: string;
	options: { method: "POST"; use?: unknown[] } & Record<string, unknown>;
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
		referenceId: string;
		session: { user: { id: string } };
	};
}

/**
 * Serves the Stripe plugin's subscription endpoints from Autumn, on the same
 * paths with the same body schemas and middleware, so released clients keep
 * calling `authClient.subscription.*` unchanged. Stripe's own webhook is
 * acknowledged without being processed: Autumn's webhook writes the rows.
 */
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
			stripeWebhook: createAuthEndpoint(
				webhook.path,
				webhook.options,
				async (ctx) => ctx.json({ success: true }),
			),
		},
	};
}
