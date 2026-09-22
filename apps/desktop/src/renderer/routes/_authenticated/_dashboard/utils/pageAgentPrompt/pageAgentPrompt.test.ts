import { describe, expect, it } from "bun:test";
import { buildPageAgentPrompt } from "./pageAgentPrompt";

describe("buildPageAgentPrompt", () => {
	it("asks what to create when no request is given", () => {
		const prompt = buildPageAgentPrompt();
		expect(prompt).toContain("ask what I want to create");
		expect(prompt).toContain("superset pages publish");
	});

	it("carries the request instead of asking for one", () => {
		const prompt = buildPageAgentPrompt("  Summarize the auth refactor  ");
		expect(prompt).toContain("\n\nSummarize the auth refactor\n\n");
		expect(prompt).not.toContain("ask what I want to create");
		expect(prompt).toContain("superset pages publish");
	});

	it("treats a blank request as no request", () => {
		expect(buildPageAgentPrompt("   ")).toBe(buildPageAgentPrompt());
	});
});
