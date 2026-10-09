import { describe, expect, test } from "bun:test";
import { PLAN_TIERS } from "@superset/shared/billing";
import type Stripe from "stripe";
import { isPaidAutumnPlan, legacyPlanName } from "./plans";
import {
	subscriptionRowFromStripe,
	subscriptionTransitions,
} from "./subscription-row";

function stripeSubscription(
	overrides: Partial<Stripe.Subscription> = {},
	interval: "month" | "year" = "month",
): Stripe.Subscription {
	return {
		id: "sub_1",
		customer: "cus_1",
		status: "active",
		cancel_at_period_end: false,
		cancel_at: null,
		canceled_at: null,
		ended_at: null,
		trial_start: null,
		trial_end: null,
		schedule: null,
		created: 1_700_000_000,
		cancellation_details: null,
		metadata: {},
		items: {
			data: [
				{
					id: "si_box",
					quantity: undefined,
					current_period_start: 1_700_000_000,
					current_period_end: 1_702_592_000,
					price: { recurring: { interval: "month", usage_type: "metered" } },
				},
				{
					id: "si_seats",
					quantity: 4,
					current_period_start: 1_700_000_000,
					current_period_end: 1_702_592_000,
					price: { recurring: { interval, usage_type: "licensed" } },
				},
			],
		},
		...overrides,
	} as unknown as Stripe.Subscription;
}

describe("a subscription row reads the same as the Stripe plugin wrote it", () => {
	test("status, periods, seats, interval and ids", () => {
		expect(subscriptionRowFromStripe(stripeSubscription())).toEqual({
			status: "active",
			stripeCustomerId: "cus_1",
			stripeSubscriptionId: "sub_1",
			periodStart: new Date(1_700_000_000_000),
			periodEnd: new Date(1_702_592_000_000),
			cancelAtPeriodEnd: false,
			cancelAt: null,
			canceledAt: null,
			endedAt: null,
			seats: 4,
			billingInterval: "month",
			stripeScheduleId: null,
		});
	});

	test("an annual subscription keeps Stripe's own interval, `year`", () => {
		expect(
			subscriptionRowFromStripe(stripeSubscription({}, "year")).billingInterval,
		).toBe("year");
	});

	test("a pending cancel, a schedule and a trial carry over", () => {
		const row = subscriptionRowFromStripe(
			stripeSubscription({
				cancel_at_period_end: true,
				cancel_at: 1_702_592_000,
				canceled_at: 1_701_000_000,
				schedule: "sub_sched_1",
				trial_start: 1_699_000_000,
				trial_end: 1_700_000_000,
			}),
		);
		expect(row).toMatchObject({
			cancelAtPeriodEnd: true,
			cancelAt: new Date(1_702_592_000_000),
			canceledAt: new Date(1_701_000_000_000),
			stripeScheduleId: "sub_sched_1",
			trialStart: new Date(1_699_000_000_000),
			trialEnd: new Date(1_700_000_000_000),
		});
	});
});

describe("notices fire when the Stripe plugin fired them", () => {
	test("a first live subscription, or one leaving incomplete, has started", () => {
		expect(
			subscriptionTransitions(undefined, stripeSubscription()).started,
		).toBe(true);
		expect(
			subscriptionTransitions(
				{ status: "incomplete", cancelAtPeriodEnd: false, cancelAt: null },
				stripeSubscription(),
			).started,
		).toBe(true);
	});

	test("a subscription already live at cutover does not start again", () => {
		expect(
			subscriptionTransitions(
				{ status: "active", cancelAtPeriodEnd: false, cancelAt: null },
				stripeSubscription(),
			),
		).toEqual({ started: false, canceled: false });
	});

	test("a cancel fires once, when it first appears on an active subscription", () => {
		const canceling = stripeSubscription({ cancel_at_period_end: true });
		expect(
			subscriptionTransitions(
				{ status: "active", cancelAtPeriodEnd: false, cancelAt: null },
				canceling,
			).canceled,
		).toBe(true);
		expect(
			subscriptionTransitions(
				{ status: "active", cancelAtPeriodEnd: true, cancelAt: null },
				canceling,
			).canceled,
		).toBe(false);
	});
});

describe("plan names old clients understand", () => {
	test("every paid Autumn plan reads as a tier released clients know", () => {
		for (const planId of [
			"pro",
			"pro_annual",
			"pro_plus",
			"ultra",
			"teams",
			"enterprise",
			"enterprise_acme",
		]) {
			expect(PLAN_TIERS).toContain(legacyPlanName(planId));
		}
		expect(legacyPlanName("pro_annual")).toBe("pro");
		expect(legacyPlanName("enterprise_acme")).toBe("enterprise");
	});

	test("free plans are not paid", () => {
		expect(isPaidAutumnPlan("hobby")).toBe(false);
		expect(isPaidAutumnPlan("free")).toBe(false);
		expect(isPaidAutumnPlan("pro")).toBe(true);
	});
});
