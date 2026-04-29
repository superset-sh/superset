import { describe, expect, it } from "bun:test";
import { resolveCurrentPlan } from "./useCurrentPlan";

describe("resolveCurrentPlan", () => {
	it("prefers the live subscription plan over a stale session plan", () => {
		expect(
			resolveCurrentPlan({
				subscriptionPlan: "pro",
				sessionPlan: "free",
			}),
		).toBe("pro");
	});

	it("falls back to a paid session plan when local subscriptions show no active plan (reproduces #3871)", () => {
		// A user who paid for Pro switches to V2. Their session — computed
		// server-side from the authoritative DB — reports "pro", but the local
		// Electric-synced subscriptions collection has not yet surfaced an
		// active record for the active organization (sync lag, an org-scoped
		// shape that hasn't filled in, etc.). The previous behavior dropped
		// them to "free" the moment the local query resolved as empty, which
		// triggered the V2 paywall and asked them to pay again.
		expect(
			resolveCurrentPlan({
				subscriptionPlan: null,
				sessionPlan: "pro",
			}),
		).toBe("pro");
	});

	it("returns free when neither local subscriptions nor session report a paid plan", () => {
		expect(
			resolveCurrentPlan({
				subscriptionPlan: null,
				sessionPlan: null,
			}),
		).toBe("free");
	});

	it("returns free when local subscriptions and session both report free", () => {
		expect(
			resolveCurrentPlan({
				subscriptionPlan: "free",
				sessionPlan: "free",
			}),
		).toBe("free");
	});

	it("falls back to the session plan while subscriptions are still loading", () => {
		expect(
			resolveCurrentPlan({
				subscriptionPlan: null,
				sessionPlan: "pro",
			}),
		).toBe("pro");
	});

	it("supports enterprise subscriptions", () => {
		expect(
			resolveCurrentPlan({
				subscriptionPlan: "enterprise",
				sessionPlan: "free",
			}),
		).toBe("enterprise");
	});
});
