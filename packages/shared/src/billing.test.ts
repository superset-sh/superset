import { describe, expect, test } from "bun:test";
import {
	planAllowsAutomations,
	planAllowsTriggerKind,
	planTierFromSubscription,
	requiredPlanForTriggerKind,
} from "./billing";
import { LAUNCHED_TRIGGER_KINDS } from "./constants";

describe("planAllowsAutomations", () => {
	test("free cannot, paid plans can", () => {
		expect(planAllowsAutomations("free")).toBe(false);
		expect(planAllowsAutomations("pro")).toBe(true);
		expect(planAllowsAutomations("enterprise")).toBe(true);
	});
});

describe("planTierFromSubscription", () => {
	test("no subscription is free", () => {
		expect(planTierFromSubscription(null)).toBe("free");
		expect(planTierFromSubscription(undefined)).toBe("free");
	});

	test("a paying subscription resolves to its plan", () => {
		expect(planTierFromSubscription({ plan: "pro", status: "active" })).toBe(
			"pro",
		);
		expect(
			planTierFromSubscription({ plan: "enterprise", status: "trialing" }),
		).toBe("enterprise");
		// Stripe is still retrying; access continues through its dunning window.
		expect(planTierFromSubscription({ plan: "pro", status: "past_due" })).toBe(
			"pro",
		);
	});

	test("a lapsed subscription is free again", () => {
		expect(planTierFromSubscription({ plan: "pro", status: "canceled" })).toBe(
			"free",
		);
		expect(planTierFromSubscription({ plan: "free", status: "active" })).toBe(
			"free",
		);
	});
});

describe("planAllowsTriggerKind", () => {
	test("free plans get no trigger kinds at all", () => {
		expect(planAllowsTriggerKind("free", "schedule")).toBe(false);
		expect(planAllowsTriggerKind("free", "slack")).toBe(false);
		expect(planAllowsTriggerKind("free", "microsoft_teams")).toBe(false);
	});

	test("pro gets schedules and the pro providers but not the enterprise ones", () => {
		expect(planAllowsTriggerKind("pro", "schedule")).toBe(true);
		expect(planAllowsTriggerKind("pro", "slack")).toBe(true);
		expect(planAllowsTriggerKind("pro", "linear")).toBe(true);
		expect(planAllowsTriggerKind("pro", "microsoft_teams")).toBe(false);
	});

	test("enterprise gets everything", () => {
		for (const kind of LAUNCHED_TRIGGER_KINDS) {
			expect(planAllowsTriggerKind("enterprise", kind)).toBe(true);
		}
	});

	test("an unknown kind is unrestricted rather than blocked", () => {
		// The map gates known providers; it is not an allowlist, so a kind it
		// has never heard of must not become accidentally ungateable-but-blocked.
		expect(requiredPlanForTriggerKind("not_a_provider")).toBeUndefined();
		expect(planAllowsTriggerKind("free", "not_a_provider")).toBe(true);
	});
});

/**
 * The drift guard, and the reason this file exists.
 *
 * Adding a provider is a code-only change everywhere else, so nothing forces
 * whoever adds one to think about billing — and a kind missing from the map is
 * silently free for everybody, when automations as a whole are Pro. This
 * fails the moment that happens.
 */
describe("every launched provider is priced", () => {
	for (const kind of LAUNCHED_TRIGGER_KINDS) {
		test(`${kind}`, () => {
			expect(requiredPlanForTriggerKind(kind)).toBeDefined();
			expect(planAllowsTriggerKind("free", kind)).toBe(false);
		});
	}
});
