// @ts-nocheck
import { describe, expect, it } from "bun:test";
import { getEligibleSyncProviders } from "./provider-routing";

describe("getEligibleSyncProviders", () => {
	it("returns only local-task creation providers for local tasks", () => {
		expect(
			getEligibleSyncProviders(null, ["linear", "slack", "github"]),
		).toEqual(["linear"]);
	});

	it("returns only the matching provider for provider-owned tasks", () => {
		expect(getEligibleSyncProviders("linear", ["linear", "slack"])).toEqual([
			"linear",
		]);
	});

	it("returns no providers for github-owned tasks in the current design", () => {
		expect(getEligibleSyncProviders("github", ["linear", "slack"])).toEqual([]);
	});
});
