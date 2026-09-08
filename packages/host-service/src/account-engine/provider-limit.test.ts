import { describe, expect, it } from "bun:test";
import { observeProviderLimit } from "./provider-limit.ts";

describe("provider limit evidence", () => {
	for (const verb of ["hit", "reached"]) {
		it(`extracts the model from the ${verb} banner alone`, () => {
			expect(
				observeProviderLimit(
					"claude",
					`Working with Sonnet\nYou've ${verb} your Opus 4.5 limit · resets 3pm\nTry Haiku`,
				),
			).toEqual({ model: "Opus 4.5", source: "terminal" });
		});
	}
	for (const scope of [
		"",
		"session ",
		"weekly ",
		"usage ",
		"5-hour ",
		"7-day ",
	]) {
		it(`recognizes generic ${scope || "unqualified "}limits`, () => {
			expect(
				observeProviderLimit("claude", `You've reached your ${scope}limit`),
			).toEqual({ model: null, source: "terminal" });
		});
	}
	it("does not combine unrelated lines into model evidence", () => {
		expect(
			observeProviderLimit("claude", "You've hit your Opus\nlimit"),
		).toBeNull();
		expect(
			observeProviderLimit("claude", "API Error: authentication failed"),
		).toBeNull();
	});
	it("keeps Codex usage evidence provider-specific", () => {
		expect(
			observeProviderLimit("codex", "You’ve hit your usage limit"),
		).toEqual({ model: null, source: "terminal" });
		expect(
			observeProviderLimit("codex", "You've hit your Opus limit"),
		).toBeNull();
	});
});
