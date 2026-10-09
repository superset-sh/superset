import { beforeEach, describe, expect, test } from "bun:test";
import { stripe } from "@better-auth/stripe";
import { createAuthEndpoint } from "better-auth/api";
import type Stripe from "stripe";
import {
	type AutumnBillingDeps,
	BILLING_ERROR_CODES,
	cancelWithAutumn,
	ENTERPRISE_CHECKOUT_MESSAGE,
	type LiveSubscription,
	restoreWithAutumn,
	type UpgradeBody,
	upgradeWithAutumn,
	withAutumnBilling,
} from "./autumn-endpoints";

const ORG = "00000000-0000-0000-0000-0000000000aa";
const WEB = "https://app.superset.sh";

function stripePlugin() {
	return stripe({
		stripeClient: {} as Stripe,
		stripeWebhookSecret: "whsec_test",
		subscription: {
			enabled: true,
			plans: [
				{
					name: "pro",
					priceId: "price_pro",
					annualDiscountPriceId: "price_pro_y",
				},
				{ name: "enterprise", priceId: "price_ent" },
			],
		},
	});
}

let calls: { method: string; params: unknown }[];
let live: LiveSubscription | null;
let paymentUrl: string | null;

function fakeDeps(): AutumnBillingDeps {
	return {
		attach: async (params) => {
			calls.push({ method: "attach", params });
			return { paymentUrl };
		},
		update: async (params) => {
			calls.push({ method: "update", params });
			return {};
		},
		openCustomerPortal: async (params) => {
			calls.push({ method: "portal", params });
			return { url: "https://billing.stripe.com/p/session/test" };
		},
		ensureCustomer: async (id) => {
			calls.push({ method: "ensureCustomer", params: id });
		},
		currentPlanId: async () => (live ? "pro" : null),
		findLiveSubscription: async () => live,
		countBillableSeats: async () => 3,
		sync: async (id) => {
			calls.push({ method: "sync", params: id });
		},
		handleStripeWebhook: async () => {
			calls.push({ method: "stripeWebhook", params: null });
		},
	};
}

function liveSubscription(
	overrides: Partial<LiveSubscription> = {},
): LiveSubscription {
	return {
		plan: "pro",
		status: "active",
		billingInterval: "month",
		cancelAtPeriodEnd: false,
		cancelAt: null,
		stripeSubscriptionId: "sub_1",
		stripeScheduleId: null,
		...overrides,
	};
}

beforeEach(() => {
	calls = [];
	live = null;
	paymentUrl = "https://checkout.stripe.com/c/pay/cs_test";
});

describe("released clients keep the same routes", () => {
	const original = stripePlugin();
	const wrapped = withAutumnBilling(original, {
		enabled: true,
		deps: fakeDeps,
	});

	for (const key of [
		"upgradeSubscription",
		"cancelSubscription",
		"restoreSubscription",
		"stripeWebhook",
	] as const) {
		test(`${key} keeps its path, method, body schema and middleware`, () => {
			const before = original.endpoints[key];
			const after = wrapped.endpoints[key];
			expect(after).not.toBe(before);
			expect(after.path).toBe(before.path);
			expect(after.options.method).toEqual(before.options.method);
			expect(String(after.options.body)).toBe(String(before.options.body));
			const injected =
				createAuthEndpoint("/probe", { method: "GET" }, async () => null)
					.options.use?.length ?? 0;
			const own = (endpoint: typeof before) =>
				endpoint.options.use?.slice(0, -injected || undefined) ?? [];
			expect(own(after)).toHaveLength(own(before).length);
			own(after).forEach((middleware, index) => {
				expect(middleware).toBe(own(before)[index] as typeof middleware);
			});
		});
	}

	test("the routes are the ones released clients call", () => {
		expect(wrapped.endpoints.upgradeSubscription.path).toBe(
			"/subscription/upgrade",
		);
		expect(wrapped.endpoints.cancelSubscription.path).toBe(
			"/subscription/cancel",
		);
		expect(wrapped.endpoints.restoreSubscription.path).toBe(
			"/subscription/restore",
		);
		expect(wrapped.endpoints.stripeWebhook.path).toBe("/stripe/webhook");
	});

	test("endpoints Autumn does not serve are untouched", () => {
		const plugin = stripePlugin();
		const result = withAutumnBilling(plugin, {
			enabled: true,
			deps: fakeDeps,
		});
		expect(result.endpoints.listActiveSubscriptions).toBe(
			plugin.endpoints.listActiveSubscriptions,
		);
		expect(result.endpoints.subscriptionSuccess).toBe(
			plugin.endpoints.subscriptionSuccess,
		);
		expect(result.endpoints.createBillingPortal).toBe(
			plugin.endpoints.createBillingPortal,
		);
		expect(result.id).toBe("stripe");
	});

	test("with Autumn off the Stripe plugin is returned as is", () => {
		const plugin = stripePlugin();
		expect(withAutumnBilling(plugin, { enabled: false, deps: fakeDeps })).toBe(
			plugin,
		);
	});
});

describe("payloads released clients send", () => {
	const schema = stripePlugin().endpoints.upgradeSubscription.options.body;
	const payloads = {
		"desktop billing overview": {
			plan: "pro",
			referenceId: ORG,
			annual: false,
			seats: 2,
			successUrl: `${WEB}/settings/billing?success=true`,
			cancelUrl: WEB,
			disableRedirect: true,
		},
		"desktop plans page": {
			plan: "pro",
			referenceId: ORG,
			annual: true,
			seats: 2,
			successUrl: `${WEB}/settings/billing?success=true`,
			cancelUrl: WEB,
			returnUrl: WEB,
			disableRedirect: true,
		},
		"web billing settings": {
			plan: "pro",
			referenceId: ORG,
			annual: false,
			seats: 5,
			successUrl: `${WEB}/settings/billing?success=true`,
			cancelUrl: `${WEB}/settings/billing`,
			returnUrl: `${WEB}/settings/billing`,
			disableRedirect: true,
		},
	};

	for (const [caller, payload] of Object.entries(payloads)) {
		test(`${caller}: parses and gets a checkout url back`, async () => {
			const body = schema?.parse(payload) as UpgradeBody;
			const result = await upgradeWithAutumn(fakeDeps(), {
				userId: "user_1",
				referenceId: ORG,
				body,
			});
			expect(result).toEqual({
				url: "https://checkout.stripe.com/c/pay/cs_test",
				redirect: false,
			});
		});
	}
});

describe("upgrade", () => {
	const body: UpgradeBody = {
		plan: "pro",
		successUrl: `${WEB}/settings/billing?success=true`,
		cancelUrl: WEB,
		disableRedirect: true,
	};

	test("monthly checkout keeps Stripe's checkout settings and counts seats on the server", async () => {
		await upgradeWithAutumn(fakeDeps(), {
			userId: "user_1",
			referenceId: ORG,
			body,
		});
		expect(calls.map((call) => call.method)).toEqual([
			"ensureCustomer",
			"attach",
		]);
		expect(calls[1]?.params).toEqual({
			customerId: ORG,
			planId: "pro",
			featureQuantities: [{ featureId: "seats", quantity: 3 }],
			successUrl: body.successUrl,
			redirectMode: "always",
			checkoutSessionParams: {
				cancel_url: WEB,
				allow_promotion_codes: true,
				billing_address_collection: "required",
				metadata: { organizationId: ORG, initiatedByUserId: "user_1" },
			},
		});
	});

	test("annual checkout uses the annual plan and no promotion codes", async () => {
		await upgradeWithAutumn(fakeDeps(), {
			userId: "user_1",
			referenceId: ORG,
			body: { ...body, annual: true },
		});
		const params = calls[1]?.params as {
			planId: string;
			checkoutSessionParams: { allow_promotion_codes: boolean };
		};
		expect(params.planId).toBe("pro_annual");
		expect(params.checkoutSessionParams.allow_promotion_codes).toBe(false);
	});

	test("with no checkout page needed, upgrade syncs and sends the client to the success page", async () => {
		paymentUrl = null;
		const result = await upgradeWithAutumn(fakeDeps(), {
			userId: "user_1",
			referenceId: ORG,
			body,
		});
		expect(result.url).toBe(body.successUrl);
		expect(calls.at(-1)).toEqual({ method: "sync", params: ORG });
	});

	test("enterprise is refused with the same message as before", async () => {
		await expect(
			upgradeWithAutumn(fakeDeps(), {
				userId: "user_1",
				referenceId: ORG,
				body: { ...body, plan: "enterprise" },
			}),
		).rejects.toThrow(ENTERPRISE_CHECKOUT_MESSAGE);
		expect(calls).toEqual([]);
	});

	test("an unknown plan answers SUBSCRIPTION_PLAN_NOT_FOUND", async () => {
		await expect(
			upgradeWithAutumn(fakeDeps(), {
				userId: "user_1",
				referenceId: ORG,
				body: { ...body, plan: "team" },
			}),
		).rejects.toMatchObject({
			status: "BAD_REQUEST",
			body: {
				code: "SUBSCRIPTION_PLAN_NOT_FOUND",
				message: BILLING_ERROR_CODES.SUBSCRIPTION_PLAN_NOT_FOUND,
			},
		});
	});

	test("the same plan and interval again answers ALREADY_SUBSCRIBED_PLAN, a new interval goes through", async () => {
		live = liveSubscription();
		await expect(
			upgradeWithAutumn(fakeDeps(), {
				userId: "user_1",
				referenceId: ORG,
				body,
			}),
		).rejects.toMatchObject({
			body: { code: "ALREADY_SUBSCRIBED_PLAN" },
		});
		await upgradeWithAutumn(fakeDeps(), {
			userId: "user_1",
			referenceId: ORG,
			body: { ...body, annual: true },
		});
		expect(calls.some((call) => call.method === "attach")).toBe(true);
	});
});

describe("cancel", () => {
	test("returns a portal url the client opens, as before", async () => {
		live = liveSubscription();
		expect(
			await cancelWithAutumn(fakeDeps(), {
				referenceId: ORG,
				body: { returnUrl: WEB, disableRedirect: false },
			}),
		).toEqual({
			url: "https://billing.stripe.com/p/session/test",
			redirect: true,
		});
		expect(calls).toEqual([
			{ method: "portal", params: { customerId: ORG, returnUrl: WEB } },
		]);
	});

	test("no live subscription answers SUBSCRIPTION_NOT_FOUND", async () => {
		await expect(
			cancelWithAutumn(fakeDeps(), {
				referenceId: ORG,
				body: { returnUrl: WEB, disableRedirect: false },
			}),
		).rejects.toMatchObject({ body: { code: "SUBSCRIPTION_NOT_FOUND" } });
	});
});

describe("restore", () => {
	test("undoes a pending cancel through Autumn and syncs", async () => {
		live = liveSubscription({ cancelAtPeriodEnd: true });
		const result = await restoreWithAutumn(fakeDeps(), { referenceId: ORG });
		expect(calls).toEqual([
			{
				method: "update",
				params: { customerId: ORG, planId: "pro", cancelAction: "uncancel" },
			},
			{ method: "sync", params: ORG },
		]);
		expect(result).toMatchObject({ id: "sub_1", cancel_at_period_end: false });
	});

	test("nothing pending answers SUBSCRIPTION_NOT_PENDING_CHANGE", async () => {
		live = liveSubscription();
		await expect(
			restoreWithAutumn(fakeDeps(), { referenceId: ORG }),
		).rejects.toMatchObject({
			body: { code: "SUBSCRIPTION_NOT_PENDING_CHANGE" },
		});
	});

	test("a lapsed subscription answers SUBSCRIPTION_NOT_ACTIVE", async () => {
		live = liveSubscription({ status: "past_due", cancelAtPeriodEnd: true });
		await expect(
			restoreWithAutumn(fakeDeps(), { referenceId: ORG }),
		).rejects.toMatchObject({ body: { code: "SUBSCRIPTION_NOT_ACTIVE" } });
	});
});
