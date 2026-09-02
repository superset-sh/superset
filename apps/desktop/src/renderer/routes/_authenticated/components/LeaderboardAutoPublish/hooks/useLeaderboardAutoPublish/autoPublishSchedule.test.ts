import { describe, expect, it } from "bun:test";
import {
	hashPayload,
	isPublishDue,
	PUBLISH_INTERVAL_MS,
	publishWindowDays,
} from "./autoPublishSchedule";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = 1_800_000_000_000;

describe("isPublishDue", () => {
	it("holds off until the two-hour deadline passes", () => {
		const state = {
			handle: "me",
			lastPublishedAt: NOW - HOUR,
			lastPayloadHash: "a",
		};
		expect(isPublishDue(state, NOW)).toBe(false);
	});

	it("fires once the deadline is reached", () => {
		const state = {
			handle: "me",
			lastPublishedAt: NOW - PUBLISH_INTERVAL_MS,
			lastPayloadHash: "a",
		};
		expect(isPublishDue(state, NOW)).toBe(true);
	});

	it("fires on a machine that has never published", () => {
		expect(
			isPublishDue(
				{ handle: "me", lastPublishedAt: 0, lastPayloadHash: null },
				NOW,
			),
		).toBe(true);
	});

	it("fires when a clock change puts the last publish in the future", () => {
		const state = {
			handle: "me",
			lastPublishedAt: NOW + 10 * DAY,
			lastPayloadHash: "a",
		};
		expect(isPublishDue(state, NOW)).toBe(true);
	});
});

describe("publishWindowDays", () => {
	it("backfills the full window on a first publish", () => {
		expect(
			publishWindowDays(
				{ handle: "me", lastPublishedAt: 0, lastPayloadHash: null },
				NOW,
			),
		).toBe(30);
	});

	it("uses the two-day floor in steady state", () => {
		const state = {
			handle: "me",
			lastPublishedAt: NOW - PUBLISH_INTERVAL_MS,
			lastPayloadHash: "a",
		};
		expect(publishWindowDays(state, NOW)).toBe(2);
	});

	it("widens to cover a gap the app was closed for", () => {
		const state = {
			handle: "me",
			lastPublishedAt: NOW - 6 * DAY,
			lastPayloadHash: "a",
		};
		expect(publishWindowDays(state, NOW)).toBe(7);
	});

	it("clamps a very long absence to the backfill ceiling", () => {
		const state = {
			handle: "me",
			lastPublishedAt: NOW - 400 * DAY,
			lastPayloadHash: "a",
		};
		expect(publishWindowDays(state, NOW)).toBe(30);
	});

	it("never returns less than the floor when the clock moved backwards", () => {
		const state = {
			handle: "me",
			lastPublishedAt: NOW + 5 * DAY,
			lastPayloadHash: "a",
		};
		expect(publishWindowDays(state, NOW)).toBe(2);
	});
});

describe("hashPayload", () => {
	it("matches for identical payloads", () => {
		const payload = {
			days: [{ day: "2026-08-25", model: "opus", output: 10 }],
			factoryDays: [{ day: "2026-08-25", sessions: 3 }],
		};
		expect(hashPayload(payload)).toBe(hashPayload(structuredClone(payload)));
	});

	it("differs when a token count changes", () => {
		expect(hashPayload({ days: [{ output: 10 }], factoryDays: [] })).not.toBe(
			hashPayload({ days: [{ output: 11 }], factoryDays: [] }),
		);
	});

	it("differs when a day is added", () => {
		expect(
			hashPayload({ days: [{ day: "2026-08-25" }], factoryDays: [] }),
		).not.toBe(
			hashPayload({
				days: [{ day: "2026-08-25" }, { day: "2026-08-24" }],
				factoryDays: [],
			}),
		);
	});

	it("differs when only factoryDays changed", () => {
		expect(
			hashPayload({ days: [], factoryDays: [{ agentPrsMerged: 1 }] }),
		).not.toBe(hashPayload({ days: [], factoryDays: [{ agentPrsMerged: 2 }] }));
	});
});
