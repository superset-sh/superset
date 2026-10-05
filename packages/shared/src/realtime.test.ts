import { describe, expect, test } from "bun:test";
import { mergePresenceByUser } from "./realtime";

describe("mergePresenceByUser", () => {
	test("an older update arriving late does not undo a newer one", () => {
		const merged = mergePresenceByUser(
			[
				{ userId: "kiet", lastSeenAt: 200 },
				{ userId: "satya", lastSeenAt: 150 },
			],
			[{ userId: "kiet", lastSeenAt: 100 }],
			(person) => person.lastSeenAt,
		);

		expect(merged).toEqual([
			{ userId: "kiet", lastSeenAt: 200 },
			{ userId: "satya", lastSeenAt: 150 },
		]);
	});

	test("adds new people and keeps the most recently seen first", () => {
		const merged = mergePresenceByUser(
			[{ userId: "satya", lastSeenAt: 150 }],
			[
				{ userId: "avi", lastSeenAt: 300 },
				{ userId: "satya", lastSeenAt: 160 },
			],
			(person) => person.lastSeenAt,
		);

		expect(merged).toEqual([
			{ userId: "avi", lastSeenAt: 300 },
			{ userId: "satya", lastSeenAt: 160 },
		]);
	});
});
