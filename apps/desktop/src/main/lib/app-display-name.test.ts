import { describe, expect, it } from "bun:test";
import { toAppDisplayName } from "./app-display-name";

describe("toAppDisplayName", () => {
	it("keeps every app name unchanged with the default brand", () => {
		for (const name of [
			"Superset",
			"Superset Canary",
			"Superset (my-branch)",
		]) {
			expect(toAppDisplayName(name)).toBe(name);
		}
	});

	it("swaps only the brand word and keeps the suffix", () => {
		expect(toAppDisplayName("Superset Canary", "Example")).toBe(
			"Example Canary",
		);
		expect(toAppDisplayName("Superset (my-branch)", "Example")).toBe(
			"Example (my-branch)",
		);
	});
});
