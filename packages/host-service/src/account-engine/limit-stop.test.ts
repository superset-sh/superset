import { describe, expect, it } from "bun:test";
import type { UsageQuotaWindow } from "../trpc/router/usage/types";
import {
	fallbackAllowed,
	isCorroboratedLimitStop,
	lastVisibleScreen,
	snapshotShowsLimit,
} from "./limit-stop";

const HOUR_MS = 3_600_000;
const NOW = 1_700_000_000_000;

function window(usedPercent: number): UsageQuotaWindow {
	return {
		id: "five_hour",
		label: "5-hour",
		usedPercent,
		resetsAt: null,
	};
}

describe("fallbackAllowed", () => {
	it("allows a fallback with no cooldown and no history", () => {
		expect(fallbackAllowed({ fallbackTimestamps: [], now: NOW })).toBe(true);
	});

	it("refuses while the cooldown is still running", () => {
		expect(
			fallbackAllowed({
				cooldownUntil: NOW + 1,
				fallbackTimestamps: [],
				now: NOW,
			}),
		).toBe(false);
		expect(
			fallbackAllowed({
				cooldownUntil: NOW,
				fallbackTimestamps: [],
				now: NOW,
			}),
		).toBe(true);
		// The runtime state stores "no cooldown" as null.
		expect(
			fallbackAllowed({
				cooldownUntil: null,
				fallbackTimestamps: [],
				now: NOW,
			}),
		).toBe(true);
	});

	it("refuses the fifth fallback inside one hour and allows it once the window slides", () => {
		const four = [NOW - 1_000, NOW - 2_000, NOW - 3_000, NOW - 4_000];
		expect(fallbackAllowed({ fallbackTimestamps: four, now: NOW })).toBe(false);

		// Three inside the hour plus one that has aged out.
		const aged = [NOW - 1_000, NOW - 2_000, NOW - 3_000, NOW - HOUR_MS];
		expect(fallbackAllowed({ fallbackTimestamps: aged, now: NOW })).toBe(true);
	});

	it("honours an explicit ceiling", () => {
		expect(
			fallbackAllowed({
				fallbackTimestamps: [NOW - 1_000],
				now: NOW,
				ceilingPerHour: 1,
			}),
		).toBe(false);
	});
});

describe("snapshotShowsLimit", () => {
	it("matches Claude's limit lines", () => {
		expect(
			snapshotShowsLimit(
				"claude",
				"│ You've hit your session limit · resets 3:45pm │",
			),
		).toBe(true);
		expect(snapshotShowsLimit("claude", "You've hit your weekly limit")).toBe(
			true,
		);
		expect(snapshotShowsLimit("claude", "You've hit your Opus limit")).toBe(
			true,
		);
	});

	it("matches Codex's limit line", () => {
		expect(
			snapshotShowsLimit("codex", "  You've hit your usage limit.  "),
		).toBe(true);
	});

	it("does not match across lines or on unrelated screens", () => {
		expect(snapshotShowsLimit("claude", "You've hit your\nsession limit")).toBe(
			false,
		);
		expect(
			snapshotShowsLimit("claude", "Running tests… no limit problems here"),
		).toBe(false);
		expect(snapshotShowsLimit("codex", "You've hit your weekly limit")).toBe(
			false,
		);
	});

	it("has no limit text for agents without one", () => {
		expect(snapshotShowsLimit("grok", "You've hit your usage limit")).toBe(
			false,
		);
	});
});

describe("lastVisibleScreen", () => {
	// The host's snapshot carries scrollback as well as the screen, so a limit
	// message from hours ago would otherwise corroborate a brand-new hint.
	it("keeps a limit line still on screen and drops one left in scrollback", () => {
		const rows = 3;
		const scrolledOff = [
			"You've hit your usage limit.",
			"$ ls",
			"a.txt  b.txt",
			"$ codex",
		].join("\n");
		expect(snapshotShowsLimit("codex", scrolledOff)).toBe(true);
		expect(
			snapshotShowsLimit("codex", lastVisibleScreen(scrolledOff, rows)),
		).toBe(false);

		const onScreen = ["$ ls", "$ codex", "You've hit your usage limit."].join(
			"\n",
		);
		expect(snapshotShowsLimit("codex", lastVisibleScreen(onScreen, rows))).toBe(
			true,
		);
	});

	it("returns the text unchanged when it already fits, or rows is unusable", () => {
		expect(lastVisibleScreen("one\ntwo", 5)).toBe("one\ntwo");
		expect(lastVisibleScreen("one\ntwo", 0)).toBe("one\ntwo");
		expect(lastVisibleScreen("one\ntwo", Number.NaN)).toBe("one\ntwo");
	});
});

describe("isCorroboratedLimitStop", () => {
	it("corroborates a hint the host saw on screen with a spent window", () => {
		expect(
			isCorroboratedLimitStop({
				hint: true,
				snapshotMatch: true,
				windows: [window(12), window(100)],
			}),
		).toBe(true);
	});

	it("refuses a hint the snapshot does not show, even at 100%", () => {
		expect(
			isCorroboratedLimitStop({
				hint: true,
				snapshotMatch: false,
				windows: [window(100)],
			}),
		).toBe(false);
	});

	it("refuses when the account still has headroom", () => {
		expect(
			isCorroboratedLimitStop({
				hint: true,
				snapshotMatch: true,
				windows: [window(20)],
			}),
		).toBe(false);
		expect(
			isCorroboratedLimitStop({
				hint: true,
				snapshotMatch: true,
				windows: [],
			}),
		).toBe(false);
	});

	it("refuses without a hint at all", () => {
		expect(
			isCorroboratedLimitStop({
				hint: false,
				snapshotMatch: true,
				windows: [window(100)],
			}),
		).toBe(false);
	});
});
