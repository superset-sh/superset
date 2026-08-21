import { describe, expect, test } from "bun:test";
import { mergeHostPresence } from "./relay-presence";

describe("mergeHostPresence", () => {
	test("no presence entry falls back to the DB flag", () => {
		expect(mergeHostPresence(undefined, true)).toBe(true);
		expect(mergeHostPresence(undefined, false)).toBe(false);
	});

	test("a relay sighting is authoritative in both directions", () => {
		expect(
			mergeHostPresence({ online: true, lastSeenAt: 1_755_700_000_000 }, false),
		).toBe(true);
		expect(
			mergeHostPresence({ online: false, lastSeenAt: 1_755_700_000_000 }, true),
		).toBe(false);
	});

	test("online with no lastSeenAt still counts as online", () => {
		expect(mergeHostPresence({ online: true, lastSeenAt: null }, false)).toBe(
			true,
		);
	});

	test("never-seen hosts fall back to the DB flag", () => {
		// The migration case: the new relay's DO has never seen a host that is
		// still tunneled to the previous relay, which keeps the DB flag current.
		expect(mergeHostPresence({ online: false, lastSeenAt: null }, true)).toBe(
			true,
		);
		expect(mergeHostPresence({ online: false, lastSeenAt: null }, false)).toBe(
			false,
		);
	});
});
