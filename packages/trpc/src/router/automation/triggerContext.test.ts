import { describe, expect, it } from "bun:test";
import { promptWithTriggerContext } from "./triggerContext";

const context = {
	automationId: "automation-1",
	triggerId: "trigger-1",
	scheduledFor: null,
};

const pullRequestEvent = {
	provider: "github",
	eventType: "pull_request.opened",
	title: "Add cloud automations",
	url: "https://github.com/superset-sh/superset/pull/1",
	actorLogin: "octocat",
	ref: "refs/heads/feature",
	repositoryId: "123",
	payload: {
		pull_request: {
			number: 1,
			body: `"quoted" text\\n`.repeat(3_000),
		},
	},
};

describe("promptWithTriggerContext", () => {
	it("cuts the payload until the whole prompt fits the limit", () => {
		const prompt = "Review the pull request.";
		const result = promptWithTriggerContext(
			prompt,
			context,
			pullRequestEvent,
			20_000,
		);
		expect(result.length).toBeLessThanOrEqual(20_000);
		expect(result.endsWith(prompt)).toBe(true);
		expect(result).toContain('"payloadTruncated": true');
	});

	it("keeps the default payload cap without a limit", () => {
		const result = promptWithTriggerContext(
			"Review the pull request.",
			context,
			pullRequestEvent,
		);
		expect(result.length).toBeGreaterThan(20_000);
	});

	it("leaves a prompt longer than the limit for the caller to refuse", () => {
		const prompt = "x".repeat(25_000);
		const result = promptWithTriggerContext(
			prompt,
			context,
			pullRequestEvent,
			20_000,
		);
		expect(result.endsWith(prompt)).toBe(true);
		expect(result.length).toBeGreaterThan(20_000);
	});
});
