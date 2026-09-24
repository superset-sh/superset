import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

interface FakeUser {
	id: string;
	deletionRequestedAt: Date;
	deletedAt: Date | null;
}

const NOW = new Date("2026-09-24T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

let fakeUsers: FakeUser[] = [];
let soleOwnerOf = new Map<string, string>();
let purgeFailsFor: string | null = null;
let lockHeld = false;
let purges: string[] = [];

const dialect = new PgDialect();
const params = (condition: SQL) => dialect.sqlToQuery(condition).params;
const userById = (id: string) => fakeUsers.find((user) => user.id === id);

mock.module("@/lib/verifyQstash", () => ({
	verifyQstashRequest: async () => null,
}));

// Evaluates the route's own predicate: the cutoff is read back out of the
// query so the test exercises the window arithmetic, not a copy of it.
mock.module("@superset/db/client", () => ({
	db: {
		select: () => ({
			from: () => ({
				where: (condition: SQL) => {
					const cutoff = new Date(params(condition)[0] as string);
					const matching = fakeUsers
						.filter(
							(user) =>
								user.deletedAt === null && user.deletionRequestedAt < cutoff,
						)
						.sort(
							(a, b) =>
								a.deletionRequestedAt.getTime() -
								b.deletionRequestedAt.getTime(),
						);
					return {
						orderBy: async () => matching.map(({ id }) => ({ id })),
					};
				},
			}),
		}),
	},
	dbWs: {},
}));

mock.module("@/lib/singleFlight", () => ({
	singleFlight: async (_job: string, fn: (tx: unknown) => Promise<unknown>) => {
		if (lockHeld) return { ran: false };
		const tx = {
			select: () => ({
				from: () => ({
					where: async (condition: SQL) => {
						const [id] = params(condition) as [string];
						const user = userById(id);
						return user ? [{ deletedAt: user.deletedAt }] : [];
					},
				}),
			}),
		};
		return { ran: true, result: await fn(tx) };
	},
}));

mock.module("@superset/trpc/account-purge", () => ({
	findOrganizationSolelyOwnedBy: async (userId: string) =>
		soleOwnerOf.get(userId) ?? null,
	purgeAccount: async (userId: string) => {
		purges.push(userId);
		if (userId === purgeFailsFor) throw new Error(`stripe down for ${userId}`);
		const user = userById(userId);
		if (user) user.deletedAt = NOW;
	},
}));

const { POST } = await import("./route");

const run = async () => {
	const response = await POST(
		new Request("http://localhost/api/account/jobs/purge-expired-deletions", {
			method: "POST",
		}),
	);
	return response.json();
};

let warn: ReturnType<typeof spyOn>;
let error: ReturnType<typeof spyOn>;
const realNow = Date.now;

describe("POST /api/account/jobs/purge-expired-deletions", () => {
	beforeEach(() => {
		fakeUsers = [];
		soleOwnerOf = new Map();
		purgeFailsFor = null;
		lockHeld = false;
		purges = [];
		Date.now = () => NOW.getTime();
		warn = spyOn(console, "warn").mockImplementation(() => {});
		error = spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		Date.now = realNow;
		warn.mockRestore();
		error.mockRestore();
	});

	test("purges only accounts whose recovery window has passed", async () => {
		fakeUsers = [
			{ id: "expired", deletionRequestedAt: daysAgo(31), deletedAt: null },
			{
				id: "expired-today",
				deletionRequestedAt: daysAgo(30.01),
				deletedAt: null,
			},
			{ id: "in-window", deletionRequestedAt: daysAgo(29.99), deletedAt: null },
			{ id: "fresh", deletionRequestedAt: daysAgo(1), deletedAt: null },
			{ id: "done", deletionRequestedAt: daysAgo(60), deletedAt: daysAgo(30) },
		];

		expect(await run()).toEqual({
			purged: ["expired", "expired-today"],
			skipped: [],
			failed: [],
			heldByAnotherRun: false,
			outOfTime: false,
		});
		expect(purges).toEqual(["expired", "expired-today"]);
	});

	test("skips the only owner of a shared organization, logs it, and carries on", async () => {
		fakeUsers = [
			{ id: "owner", deletionRequestedAt: daysAgo(40), deletedAt: null },
			{ id: "other", deletionRequestedAt: daysAgo(35), deletedAt: null },
		];
		soleOwnerOf.set("owner", "org-shared");

		expect(await run()).toMatchObject({
			purged: ["other"],
			skipped: [{ userId: "owner", organizationId: "org-shared" }],
			failed: [],
		});
		expect(purges).toEqual(["other"]);
		expect(userById("owner")?.deletedAt).toBeNull();
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0]?.[0])).toContain("org-shared");
	});

	test("a repeat run purges nothing", async () => {
		fakeUsers = [
			{ id: "a", deletionRequestedAt: daysAgo(31), deletedAt: null },
			{ id: "b", deletionRequestedAt: daysAgo(32), deletedAt: null },
		];

		expect((await run()).purged).toEqual(["b", "a"]);
		expect(await run()).toMatchObject({ purged: [], skipped: [], failed: [] });
		expect(purges).toEqual(["b", "a"]);
	});

	test("one account failing is logged and the rest are still purged", async () => {
		fakeUsers = [
			{ id: "broken", deletionRequestedAt: daysAgo(40), deletedAt: null },
			{ id: "fine", deletionRequestedAt: daysAgo(35), deletedAt: null },
		];
		purgeFailsFor = "broken";

		expect(await run()).toMatchObject({ purged: ["fine"], failed: ["broken"] });
		expect(error).toHaveBeenCalledTimes(1);
		expect(userById("broken")?.deletedAt).toBeNull();
	});

	test("an account purged by an overlapping run between select and lock is left alone", async () => {
		fakeUsers = [
			{ id: "raced", deletionRequestedAt: daysAgo(31), deletedAt: null },
		];
		let selected = false;
		Date.now = () => {
			if (selected) {
				const user = userById("raced");
				if (user) user.deletedAt = NOW;
			}
			selected = true;
			return NOW.getTime();
		};

		expect(await run()).toMatchObject({ purged: [], failed: [] });
		expect(purges).toEqual([]);
	});

	test("sole-owner skips do not use up the attempt cap", async () => {
		fakeUsers = Array.from({ length: 60 }, (_, index) => ({
			id: `owner-${index}`,
			deletionRequestedAt: daysAgo(90 - index),
			deletedAt: null,
		}));
		for (const user of fakeUsers) soleOwnerOf.set(user.id, `org-${user.id}`);
		fakeUsers.push({
			id: "newest",
			deletionRequestedAt: daysAgo(31),
			deletedAt: null,
		});

		expect(await run()).toMatchObject({ purged: ["newest"], failed: [] });
	});

	test("stops after the attempt cap and leaves the rest for the next run", async () => {
		fakeUsers = Array.from({ length: 51 }, (_, index) => ({
			id: `user-${index}`,
			deletionRequestedAt: daysAgo(90 - index),
			deletedAt: null,
		}));

		const first = await run();
		expect(first.purged).toHaveLength(50);
		expect(first.purged).not.toContain("user-50");
		expect((await run()).purged).toEqual(["user-50"]);
	});

	test("yields when another run holds the lock", async () => {
		fakeUsers = [
			{ id: "a", deletionRequestedAt: daysAgo(31), deletedAt: null },
		];
		lockHeld = true;

		expect(await run()).toMatchObject({ purged: [], heldByAnotherRun: true });
		expect(purges).toEqual([]);
	});
});
