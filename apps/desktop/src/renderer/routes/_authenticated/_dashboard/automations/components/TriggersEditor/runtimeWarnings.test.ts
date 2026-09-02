import { describe, expect, test } from "bun:test";
import { collectRuntimeWarnings } from "./runtimeWarnings";

/**
 * Everything the editor says about the world beneath the rows:
 *
 *   ⚠ Microsoft Teams triggers require the Enterprise plan.
 *   ⚠ This trigger will not run for messages in #secret until @Superset is
 *     invited.
 *
 * A set of rows goes in, the lines under them come out. Kept pure so the
 * combinations can be varied here — the editor itself needs a plan and two
 * live queries before it draws anything.
 */

const CHANNELS = {
	slack: {
		channels: [
			{ id: "C1", label: "#general", botMember: true },
			{ id: "C2", label: "#secret", botMember: false },
		],
	},
};

const slackRow = (ids: string[], id = "t1") => ({
	id,
	config: {
		kind: "slack" as const,
		event: "message_in_channel",
		messageFilter: null,
		actor: { mode: "any" },
		channels: { mode: "list", ids },
		completionReaction: "white_check_mark",
	},
});

const teamsRow = {
	id: "t9",
	config: {
		kind: "microsoft_teams" as const,
		event: "channel_message",
		teams: { mode: "any" },
		channels: { mode: "any" },
		actor: { mode: "any" },
		messageFilter: null,
	},
};

const scheduleRow = {
	id: "t8",
	config: {
		kind: "schedule" as const,
		rrule: "FREQ=HOURLY",
		dtstart: "2026-01-01T00:00:00.000Z",
		timezone: "UTC",
	},
};

describe("a row nothing is wrong with", () => {
	test("earns no warning", () => {
		expect(
			collectRuntimeWarnings([slackRow(["C1"])] as never, CHANNELS, "pro"),
		).toEqual([]);
	});

	test("a schedule needs no plan at all", () => {
		expect(collectRuntimeWarnings([scheduleRow] as never, {}, "free")).toEqual(
			[],
		);
	});
});

describe("a row the plan will not run", () => {
	// A downgraded organization keeps its rows rather than losing them, so the
	// warning is the only thing saying why nothing fires.
	test("names the tier a Pro trigger came from", () => {
		expect(
			collectRuntimeWarnings([slackRow(["C1"])] as never, CHANNELS, "free"),
		).toEqual(["Slack triggers require the Pro plan."]);
	});

	test("names Enterprise for a Teams trigger", () => {
		expect(collectRuntimeWarnings([teamsRow] as never, {}, "pro")).toEqual([
			"Microsoft Teams triggers require the Enterprise plan.",
		]);
	});

	test("says nothing once the plan covers it", () => {
		expect(
			collectRuntimeWarnings([teamsRow] as never, {}, "enterprise"),
		).toEqual([]);
	});
});

describe("a row that will run but stay silent", () => {
	test("says which channel it will miss", () => {
		expect(
			collectRuntimeWarnings(
				[slackRow(["C1", "C2"])] as never,
				CHANNELS,
				"pro",
			),
		).toEqual([
			"This trigger will not run for messages in #secret until @Superset is invited.",
		]);
	});
});

describe("several rows at once", () => {
	// Two rows watching the same channel earn the same sentence; saying it
	// twice would read as two different problems.
	test("say a shared warning once", () => {
		expect(
			collectRuntimeWarnings(
				[slackRow(["C2"], "t1"), slackRow(["C2"], "t2")] as never,
				CHANNELS,
				"pro",
			),
		).toHaveLength(1);
	});

	test("keep warnings that differ", () => {
		const warnings = collectRuntimeWarnings(
			[slackRow(["C2"]), teamsRow] as never,
			CHANNELS,
			"pro",
		);
		expect(warnings).toHaveLength(2);
	});

	// Both reasons hold at once, and hiding either would leave the other
	// looking like the whole story.
	test("say both when a row is above tier and silent", () => {
		const warnings = collectRuntimeWarnings(
			[slackRow(["C2"])] as never,
			CHANNELS,
			"free",
		);
		expect(warnings).toEqual([
			"Slack triggers require the Pro plan.",
			"This trigger will not run for messages in #secret until @Superset is invited.",
		]);
	});
});
