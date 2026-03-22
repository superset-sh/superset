import { describe, expect, it } from "bun:test";
import { resolveCurrentPlan } from "./useCurrentPlan";

describe("resolveCurrentPlan", () => {
	it("prefers the live subscription plan over a stale session plan", () => {
		expect(
			resolveCurrentPlan({
				subscriptionPlan: "pro",
				sessionPlan: "free",
				subscriptionsLoaded: true,
			}),
		).toBe("pro");
	});

	it("treats loaded subscriptions with no active plan as free", () => {
		expect(
			resolveCurrentPlan({
				subscriptionPlan: null,
				sessionPlan: "pro",
				subscriptionsLoaded: true,
			}),
		).toBe("free");
	});

	it("falls back to the session plan while subscriptions are still loading", () => {
		expect(
			resolveCurrentPlan({
				subscriptionPlan: null,
				sessionPlan: "pro",
				subscriptionsLoaded: false,
			}),
		).toBe("pro");
	});

	it("supports enterprise subscriptions", () => {
		expect(
			resolveCurrentPlan({
				subscriptionPlan: "enterprise",
				sessionPlan: "free",
				subscriptionsLoaded: true,
			}),
		).toBe("enterprise");
	});
});
