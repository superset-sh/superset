import { describe, expect, test } from "bun:test";
import { labelText } from "./eventLabel";
import { TRIGGER_PROVIDERS } from "./index";
import type { TriggerMenuEntry } from "./types";

/**
 * The Add Trigger menu:
 *
 *   Scheduled      ▸ Hourly · Daily · Weekly · Custom
 *   GitHub         ▸ …
 *   Slack          ▸ …
 *   Microsoft Teams▸ …
 *   Sentry         ▸ …
 *   …
 *
 * Order is most-used first rather than alphabetical, which is the decision
 * most at risk from a tidy-up: sorting this list would look like an
 * improvement and would quietly bury the triggers people reach for.
 */

const leaves = (entries: readonly TriggerMenuEntry[]): TriggerMenuEntry[] =>
	entries.flatMap((entry) =>
		"children" in entry ? leaves(entry.children) : [entry],
	);

describe("the Add Trigger menu", () => {
	test("leads with the providers people reach for, not the alphabet", () => {
		const order = TRIGGER_PROVIDERS.map((provider) => provider.label);
		expect(order.slice(0, 5)).toEqual([
			"Scheduled",
			"GitHub",
			"Slack",
			"Microsoft Teams",
			"Sentry",
		]);
		expect(order).not.toEqual([...order].sort());
	});

	// Deliberately four. A cadence is chosen once, when the trigger is added,
	// so this list is the entire vocabulary of a scheduled row.
	test("offers exactly four cadences", () => {
		const schedule = TRIGGER_PROVIDERS.find((p) => p.kind === "schedule");
		expect(schedule?.menu.map((entry) => labelText(entry.label))).toEqual([
			"Hourly",
			"Daily",
			"Weekly",
			"Custom",
		]);
	});

	test("every entry creates a config belonging to its own provider", () => {
		for (const provider of TRIGGER_PROVIDERS) {
			for (const leaf of leaves(provider.menu)) {
				if (!("create" in leaf)) continue;
				expect(leaf.create().kind).toBe(provider.kind);
			}
		}
	});

	// A row is rendered by whichever provider owns its kind, so two providers
	// claiming one kind would make that lookup arbitrary.
	test("no two providers claim the same kind", () => {
		const kinds = TRIGGER_PROVIDERS.map((provider) => provider.kind);
		expect(new Set(kinds).size).toBe(kinds.length);
	});
});
