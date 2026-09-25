import { describe, expect, test } from "bun:test";
import { labelText, triggerEventLabel } from "./eventLabel";
import { githubProvider } from "./github/github";
import { slackProvider } from "./slack/slack";

/**
 * What a row calls itself when its sentence is not worth showing — a trigger
 * whose integration nobody has connected has nothing selectable in it.
 *
 * The name is read off the provider's own Add Trigger menu rather than
 * declared a second time, so these assert that the menu remains the single
 * source: a renamed menu entry renames the row with it.
 */
describe("triggerEventLabel", () => {
	test("reads a nested event's name off the menu", () => {
		const label = triggerEventLabel(
			githubProvider as never,
			{
				kind: "github",
				event: "pull_request.opened",
			} as never,
		);
		expect(label.length).toBeGreaterThan(0);
		expect(label).not.toBe(labelText(githubProvider.label));
	});

	test("falls back to the provider for an event the menu no longer names", () => {
		expect(
			triggerEventLabel(
				githubProvider as never,
				{
					kind: "github",
					event: "an_event_that_was_removed",
				} as never,
			),
		).toBe(labelText(githubProvider.label));
	});

	test("falls back to the provider for a config with no event at all", () => {
		expect(
			triggerEventLabel(slackProvider as never, { kind: "slack" } as never),
		).toBe(labelText(slackProvider.label));
	});
});
