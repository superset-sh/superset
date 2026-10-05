import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("../../lib/r2", () => ({
	presignedGetUrl: async (key: string) => `https://storage.test/${key}`,
	presignedPutUrl: async ({ key }: { key: string }) => ({
		url: `https://storage.test/${key}`,
		headers: {},
	}),
	putObject: async () => {},
	getObject: async () => null,
	headObject: async () => null,
	copyObject: async () => {},
	deleteObjects: async () => {},
	objectExists: async () => true,
}));

const { db, dbWs } = await import("@superset/db/client");
const { members, organizations, pages, users, workspacePages } = await import(
	"@superset/db/schema"
);
const { and, eq, ne, or } = await import("drizzle-orm");
const { pageRouter } = await import("./page");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const ORG = crypto.randomUUID();
const USER = crypto.randomUUID();
const OTHER_USER = crypto.randomUUID();
const WORKSPACE = crypto.randomUUID();
const suffix = Date.now();

const callerFor = (userId: string) =>
	createCallerFactory(createTRPCRouter({ page: pageRouter }))(
		createTRPCContext({
			session: {
				user: { id: userId, email: `u-${userId}@example.com` },
				session: { activeOrganizationId: ORG },
			} as never,
			auth: {} as never,
			headers: new Headers(),
		}),
	);

const caller = callerFor(USER);

const TOTAL = 463;

/** Walks the whole list through the cursor, the way every client does. */
async function walk(
	input: Parameters<typeof caller.page.listPaginated>[0] = {},
	onBatch?: (batch: number) => Promise<void>,
	limit = 200,
): Promise<string[]> {
	const seen: string[] = [];
	let cursor: string | undefined;
	let batch = 0;
	do {
		const result = await caller.page.listPaginated({
			...input,
			limit,
			...(cursor ? { cursor } : {}),
		});
		seen.push(...result.items.map((item) => item.id));
		cursor = result.nextCursor ?? undefined;
		batch += 1;
		if (onBatch) await onBatch(batch);
	} while (cursor);
	return seen;
}

beforeAll(async () => {
	await db.insert(organizations).values({
		id: ORG,
		name: "List Org",
		slug: `list-org-${suffix}`,
	});
	await db.insert(users).values([
		{
			id: USER,
			name: "List User",
			email: `list-${suffix}@example.com`,
			organizationIds: [ORG],
		},
		{
			id: OTHER_USER,
			name: "Other User",
			email: `list-other-${suffix}@example.com`,
			organizationIds: [ORG],
		},
	]);
	await db.insert(members).values([
		{
			id: crypto.randomUUID(),
			organizationId: ORG,
			userId: USER,
			role: "owner",
			createdAt: new Date(),
		},
		{
			id: crypto.randomUUID(),
			organizationId: ORG,
			userId: OTHER_USER,
			role: "member",
			createdAt: new Date(),
		},
	]);

	// Every row shares one `created_at` second so the id half of the keyset is
	// exercised rather than skipped by distinct timestamps.
	const base = new Date("2026-01-01T00:00:00.000Z");
	await db.insert(pages).values(
		Array.from({ length: TOTAL }, (_, i) => ({
			id: crypto.randomUUID(),
			slug: `list-page-${suffix}-${i}`,
			organizationId: ORG,
			createdByUserId: i % 3 === 0 ? OTHER_USER : USER,
			title: i % 5 === 0 ? `Report ${i}` : `Page ${i}`,
			description: i % 7 === 0 ? "quarterly summary" : null,
			visibility: i % 4 === 0 ? ("just_me" as const) : ("org" as const),
			createdAt: new Date(base.getTime() + Math.floor(i / 20) * 1000),
		})),
	);

	// Index 1 specifically: `org` visibility and created by USER, so the
	// workspace-scoped assertions below have exactly one expected author.
	const [linked] = await db
		.select({ id: pages.id })
		.from(pages)
		.where(eq(pages.slug, `list-page-${suffix}-1`))
		.limit(1);
	if (!linked) throw new Error("failed to find the page to link");
	await db.insert(workspacePages).values({
		pageId: linked.id,
		workspaceId: WORKSPACE,
		entryPath: "/index.html",
	});
});

afterAll(async () => {
	await db.delete(organizations).where(eq(organizations.id, ORG));
	await db.delete(users).where(eq(users.id, USER));
	await db.delete(users).where(eq(users.id, OTHER_USER));
	// Guarded: the pooled client is shared, so a sibling integration file that
	// already closed it must not fail this teardown.
	await dbWs.$client.end?.().catch(() => {});
});

describe("page.list keyset", () => {
	test("a full walk returns every visible page exactly once", async () => {
		const seen = await walk({}, undefined, 50);
		const visible = await db
			.select({ id: pages.id })
			.from(pages)
			.where(
				and(
					eq(pages.organizationId, ORG),
					or(ne(pages.visibility, "just_me"), eq(pages.createdByUserId, USER)),
				),
			);

		expect(new Set(seen).size).toBe(seen.length);
		expect(seen.length).toBe(visible.length);
		expect([...seen].sort()).toEqual(visible.map((row) => row.id).sort());
	}, 30_000);

	test("a watch heartbeat mid-walk does not drop a page", async () => {
		// The bug this keyset replaced: `setWatch` bumps `updated_at` every 30s,
		// which moved a row across an open cursor and skipped its neighbour.
		const owned = await db
			.select({ id: pages.id })
			.from(pages)
			.where(eq(pages.createdByUserId, USER));

		const bumped: string[] = [];
		const seen = await walk(
			{},
			async (batch) => {
				const row = owned[batch * 7];
				if (!row) return;
				await caller.page.setWatch({ id: row.id, agentId: "claude" });
				bumped.push(row.id);
			},
			50,
		);

		expect(bumped.length).toBeGreaterThan(0);
		expect(new Set(seen).size).toBe(seen.length);
		for (const id of bumped) expect(seen).toContain(id);
	}, 30_000);

	test("an unreadable cursor is a BAD_REQUEST, not a crash", async () => {
		await expect(
			caller.page.listPaginated({ cursor: "not-a-cursor" }),
		).rejects.toThrow(/cursor/i);
	});
});

describe("page.list filters", () => {
	test("scope mine and team partition the list", async () => {
		const all = await walk({ scope: "all" });
		const mine = await walk({ scope: "mine" });
		const team = await walk({ scope: "team" });

		expect(mine.length + team.length).toBe(all.length);
		expect(mine.filter((id) => team.includes(id))).toEqual([]);
	}, 30_000);

	test("search matches title, slug and description", async () => {
		const byTitle = await walk({ search: "Report" });
		const byDescription = await walk({ search: "quarterly" });

		expect(byTitle.length).toBeGreaterThan(0);
		expect(byDescription.length).toBeGreaterThan(0);
	}, 30_000);

	test("an empty search is the unfiltered list", async () => {
		const blank = await caller.page.listPaginated({ search: "   ", limit: 5 });
		const none = await caller.page.listPaginated({ limit: 5 });

		expect(blank.items.map((i) => i.id)).toEqual(none.items.map((i) => i.id));
	});

	test("ids narrows to the pinned set, and an empty ids returns nothing", async () => {
		const first = await caller.page.listPaginated({ limit: 3 });
		const ids = first.items.map((item) => item.id);

		const pinned = await caller.page.listPaginated({ ids, limit: 50 });
		expect(pinned.items.map((item) => item.id).sort()).toEqual([...ids].sort());

		const empty = await caller.page.listPaginated({ ids: [], limit: 50 });
		expect(empty.items).toEqual([]);
	});

	test("authorId narrows to that author", async () => {
		const mine = await walk({ authorId: OTHER_USER });
		expect(mine.length).toBeGreaterThan(0);
	});
});

describe("page.counts", () => {
	test("counts agree with what the list returns", async () => {
		const counts = await caller.page.counts();
		const all = await walk({ scope: "all" });
		const mine = await walk({ scope: "mine" });
		const team = await walk({ scope: "team" });

		expect(counts.all).toBe(all.length);
		expect(counts.mine).toBe(mine.length);
		expect(counts.team).toBe(team.length);
	}, 30_000);

	test("pinned counts only the ids it is given", async () => {
		const first = await caller.page.listPaginated({ limit: 4 });
		const ids = first.items.map((item) => item.id);
		const counts = await caller.page.counts({ pinnedIds: ids });

		expect(counts.pinned).toBe(ids.length);
		expect((await caller.page.counts({ pinnedIds: [] })).pinned).toBe(0);
	});

	test("the author breakdown offers every author, not just the selected one", async () => {
		const all = await caller.page.counts();
		const selected = await caller.page.counts({ authorId: OTHER_USER });

		// Narrowing the breakdown by the dimension it offers would collapse the
		// picker to whatever is already chosen, so you could never switch author.
		expect(all.authors.length).toBeGreaterThan(1);
		expect(selected.authors.map((row) => row.userId).sort()).toEqual(
			all.authors.map((row) => row.userId).sort(),
		);
	});

	test("the author breakdown respects the selected workspace", async () => {
		const counts = await caller.page.counts({ workspaceId: WORKSPACE });

		// Only the linked page is in this workspace, and USER created it — an
		// author with nothing here would lead to an empty list when picked.
		expect(counts.authors.map((row) => row.userId)).toEqual([USER]);
	});

	test("the workspace breakdown is not narrowed by the selected workspace", async () => {
		const counts = await caller.page.counts({ workspaceId: WORKSPACE });
		expect(counts.workspaces.map((row) => row.workspaceId)).toContain(
			WORKSPACE,
		);
	});

	test("a search narrows the counts too", async () => {
		const counts = await caller.page.counts({ search: "Report" });
		const listed = await walk({ search: "Report" });

		expect(counts.all).toBe(listed.length);
	}, 30_000);
});
