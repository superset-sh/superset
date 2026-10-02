import { expect, test } from "bun:test";
import { orphanedHostIds } from "./member-removal-orphans";

const leaving = "leaving";
const teammate = "teammate";
const gone = "already-left";

test("a host the leaving user solely owns is orphaned", () => {
	expect(
		orphanedHostIds(
			[
				{ hostId: "laptop", userId: leaving, role: "owner" },
				{ hostId: "laptop", userId: teammate, role: "member" },
			],
			leaving,
			new Set([teammate]),
		),
	).toEqual(["laptop"]);
});

test("a host with another owner who is still a member survives", () => {
	expect(
		orphanedHostIds(
			[
				{ hostId: "shared", userId: leaving, role: "owner" },
				{ hostId: "shared", userId: teammate, role: "owner" },
			],
			leaving,
			new Set([teammate]),
		),
	).toEqual([]);
});

test("an owner who already left the organization does not keep a host alive", () => {
	expect(
		orphanedHostIds(
			[
				{ hostId: "stale", userId: leaving, role: "owner" },
				{ hostId: "stale", userId: gone, role: "owner" },
			],
			leaving,
			new Set([teammate]),
		),
	).toEqual(["stale"]);
});

test("a host the leaving user only belongs to survives while its owner is a member", () => {
	expect(
		orphanedHostIds(
			[
				{ hostId: "theirs", userId: teammate, role: "owner" },
				{ hostId: "theirs", userId: leaving, role: "member" },
			],
			leaving,
			new Set([teammate]),
		),
	).toEqual([]);
});

test("a host the leaving user only belongs to is swept once its owner has already left", () => {
	expect(
		orphanedHostIds(
			[
				{ hostId: "legacy", userId: gone, role: "owner" },
				{ hostId: "legacy", userId: leaving, role: "member" },
			],
			leaving,
			new Set([teammate]),
		),
	).toEqual(["legacy"]);
});

test("hosts the leaving user cannot reach are never touched", () => {
	expect(
		orphanedHostIds(
			[{ hostId: "unrelated", userId: gone, role: "owner" }],
			leaving,
			new Set([teammate]),
		),
	).toEqual([]);
});
