import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const blobStore = new Map<string, Buffer>();
let putCalls = 0;
mock.module("@vercel/blob", () => ({
	put: async (pathname: string, body: Buffer, _opts: unknown) => {
		putCalls += 1;
		const stored = `${pathname}-${putCalls}`;
		blobStore.set(stored, body);
		return { pathname: stored, url: `https://blob.test/${stored}` };
	},
	head: async (pathname: string) => {
		if (!blobStore.has(pathname)) throw new Error("blob not found");
		return { url: `https://blob.test/${pathname}`, pathname };
	},
	del: async () => {},
}));

const { db, dbWs } = await import("@superset/db/client");
const {
	members,
	organizations,
	pageVersions,
	reviewPages,
	users,
	workspacePages,
} = await import("@superset/db/schema");
const { and, eq } = await import("drizzle-orm");
const { publishReview } = await import("./publish");
const { publishReviewSchema } = await import("./schema");

const ORG = crypto.randomUUID();
const OTHER_ORG = crypto.randomUUID();
const USER = crypto.randomUUID();
const OTHER_USER = crypto.randomUUID();
const WORKSPACE = crypto.randomUUID();
const suffix = Date.now();

const findings = [
	{
		file: "a.ts",
		line: 1,
		summary: "issue",
		failureScenario: "n/a",
		verdict: "CONFIRMED" as const,
	},
];

// Each test gets its own PR number, so anchors never collide across tests.
const prUrl = (prNumber: number) =>
	`https://github.com/superset-sh/superset/pull/${prNumber}`;

const publish = (input: Record<string, unknown>) =>
	publishReview({
		input: {
			title: "Test Review",
			findings,
			...input,
		} as never,
		organizationId: ORG,
		userId: USER,
	});

const linksFor = (prNumber: number, organizationId = ORG) =>
	db
		.select()
		.from(reviewPages)
		.where(
			and(
				eq(reviewPages.organizationId, organizationId),
				eq(reviewPages.repoOwner, "superset-sh"),
				eq(reviewPages.repoName, "superset"),
				eq(reviewPages.prNumber, prNumber),
			),
		);

beforeAll(async () => {
	await db.insert(organizations).values([
		{ id: ORG, name: "Test Org", slug: `test-org-review-${suffix}` },
		{
			id: OTHER_ORG,
			name: "Other Test Org",
			slug: `other-test-org-review-${suffix}`,
		},
	]);
	await db.insert(users).values([
		{
			id: USER,
			name: "Test User",
			email: `test-review-${suffix}@example.com`,
			organizationIds: [ORG],
		},
		{
			id: OTHER_USER,
			name: "Other Member",
			email: `other-review-${suffix}@example.com`,
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
});

afterAll(async () => {
	await db.delete(organizations).where(eq(organizations.id, ORG));
	await db.delete(organizations).where(eq(organizations.id, OTHER_ORG));
	await db.delete(users).where(eq(users.id, USER));
	await db.delete(users).where(eq(users.id, OTHER_USER));
	await dbWs.$client.end?.();
});

describe("publishReview", () => {
	test("first publish for a PR creates a page at v1 and links it", async () => {
		const result = await publish({ prUrl: prUrl(1) });

		expect(result.version).toBe(1);
		expect(result.visibility).toBe("org");

		const links = await linksFor(1);
		expect(links).toHaveLength(1);
		expect(links[0]?.pageId).toBe(result.id);
	});

	test("re-reviewing the same PR adds a version to the same page", async () => {
		const first = await publish({ prUrl: prUrl(2) });
		const second = await publish({ prUrl: prUrl(2) });

		expect(second.id).toBe(first.id);
		expect(second.version).toBe(2);

		const links = await linksFor(2);
		expect(links).toHaveLength(1);
	});

	test("a standalone review (prUrl only) and a later workspace-anchored review of the same PR share one page", async () => {
		const standalone = await publish({ prUrl: prUrl(3) });
		const workspaceRun = await publish({
			prUrl: prUrl(3),
			workspaceId: WORKSPACE,
			entryPath: ".superset/review.html",
		});

		expect(workspaceRun.id).toBe(standalone.id);
		expect(workspaceRun.version).toBe(2);
	});

	test("different PRs get different pages", async () => {
		const a = await publish({ prUrl: prUrl(4) });
		const b = await publish({ prUrl: prUrl(5) });
		expect(a.id).not.toBe(b.id);
	});

	test("URL casing of owner/repo doesn't fork the anchor", async () => {
		const first = await publish({
			prUrl: `https://github.com/Superset-SH/Superset/pull/6`,
		});
		const second = await publish({ prUrl: prUrl(6) });

		expect(second.id).toBe(first.id);
		expect(second.version).toBe(2);

		const links = await linksFor(6);
		expect(links).toHaveLength(1);
	});

	test("the same PR reviewed in two different orgs gets two independent pages", async () => {
		const mine = await publish({ prUrl: prUrl(7) });
		const theirs = await publishReview({
			input: { title: "Test Review", findings, prUrl: prUrl(7) } as never,
			organizationId: OTHER_ORG,
			userId: USER,
		});

		expect(theirs.id).not.toBe(mine.id);
		expect(theirs.version).toBe(1);
		expect(await linksFor(7)).toHaveLength(1);
		expect(await linksFor(7, OTHER_ORG)).toHaveLength(1);
	});

	test("workspace-anchored review with no PR link behaves like a plain page: same entryPath versions, no reviewPages row", async () => {
		const first = await publish({
			workspaceId: WORKSPACE,
			entryPath: "no-pr/review.html",
		});
		const second = await publish({
			workspaceId: WORKSPACE,
			entryPath: "no-pr/review.html",
		});

		expect(second.id).toBe(first.id);
		expect(second.version).toBe(2);

		const links = await db
			.select()
			.from(workspacePages)
			.where(eq(workspacePages.entryPath, "no-pr/review.html"));
		expect(links).toHaveLength(1);
	});

	test("a non-GitHub prUrl stays display-only: the workspace anchors, no reviewPages row", async () => {
		const result = await publish({
			prUrl: "https://gitlab.com/acme/widgets/-/merge_requests/9",
			workspaceId: WORKSPACE,
			entryPath: "gitlab/review.html",
		});

		expect(result.version).toBe(1);
		const links = await db
			.select()
			.from(reviewPages)
			.where(eq(reviewPages.pageId, result.id));
		expect(links).toHaveLength(0);
	});

	test("the rendered HTML embeds the findings", async () => {
		const result = await publish({
			prUrl: prUrl(8),
			title: "Renders findings",
		});
		const [row] = await db
			.select()
			.from(pageVersions)
			.where(eq(pageVersions.pageId, result.id));
		const stored = blobStore.get(row?.blobPathname ?? "");
		expect(stored?.toString()).toContain("a.ts:1");
	});
});

describe("schema validation", () => {
	const base = { title: "Test Review", findings };

	test("a malformed prUrl with no workspace fallback is rejected", async () => {
		const result = publishReviewSchema.safeParse({
			...base,
			prUrl: "https://github.com/superset-sh/superset",
		});
		expect(result.success).toBe(false);
	});

	test("a non-GitHub prUrl alone is not an anchor", async () => {
		const result = publishReviewSchema.safeParse({
			...base,
			prUrl: "https://gitlab.com/acme/widgets/-/merge_requests/9",
		});
		expect(result.success).toBe(false);
	});

	test("no anchor at all is rejected", async () => {
		const result = publishReviewSchema.safeParse(base);
		expect(result.success).toBe(false);
	});

	test("a GitHub PR link alone is a complete anchor", async () => {
		const result = publishReviewSchema.safeParse({
			...base,
			prUrl: prUrl(1),
		});
		expect(result.success).toBe(true);
	});
});

describe("access control and visibility", () => {
	test("a teammate can add a version to a review someone else published", async () => {
		const first = await publish({ prUrl: prUrl(20) });

		const second = await publishReview({
			input: {
				title: "Test Review",
				findings,
				prUrl: prUrl(20),
			} as never,
			organizationId: ORG,
			userId: OTHER_USER,
		});

		expect(second.id).toBe(first.id);
		expect(second.version).toBe(2);
	});

	test("republishing without visibility leaves a manually-tightened just_me alone", async () => {
		const first = await publish({
			prUrl: prUrl(21),
			visibility: "just_me",
		});
		expect(first.visibility).toBe("just_me");

		const second = await publish({ prUrl: prUrl(21) });
		expect(second.visibility).toBe("just_me");
	});

	test("reviewing two different PRs from the same workspace/entryPath does not collide", async () => {
		const sharedEntryPath = ".superset/review.html";

		const a = await publish({
			prUrl: prUrl(22),
			workspaceId: WORKSPACE,
			entryPath: sharedEntryPath,
		});
		const b = await publish({
			prUrl: prUrl(23),
			workspaceId: WORKSPACE,
			entryPath: sharedEntryPath,
		});

		expect(a.id).not.toBe(b.id);

		const linksA = await linksFor(22);
		expect(linksA[0]?.pageId).toBe(a.id);

		const linksB = await linksFor(23);
		expect(linksB[0]?.pageId).toBe(b.id);
	});
});
