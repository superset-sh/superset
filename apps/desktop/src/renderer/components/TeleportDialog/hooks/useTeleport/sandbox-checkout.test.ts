import { describe, expect, it } from "bun:test";
import { isSandboxCheckoutReady } from "./sandbox-checkout";

describe("isSandboxCheckoutReady", () => {
	it("treats a host without a boot report as ready", () => {
		expect(isSandboxCheckoutReady({})).toBe(true);
		expect(isSandboxCheckoutReady({ sandboxBoot: null })).toBe(true);
	});

	it("is not ready while the sandbox is still cloning", () => {
		expect(
			isSandboxCheckoutReady({
				sandboxBoot: {
					stamps: [
						{ phase: "host.ready" },
						{ phase: "checkout.start" },
						{ phase: "checkout.fetch.failed" },
					],
				},
			}),
		).toBe(false);
	});

	it("is ready once the checkout phase has ended", () => {
		expect(
			isSandboxCheckoutReady({
				sandboxBoot: {
					stamps: [
						{ phase: "checkout.start" },
						{ phase: "checkout.cloned" },
						{ phase: "checkout.end" },
					],
				},
			}),
		).toBe(true);
	});
});
