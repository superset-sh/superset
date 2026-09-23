import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";

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
const {
	members,
	organizations,
	pageComments,
	pageCommentThreads,
	pages,
	pageVersions,
	users,
	workspacePages,
} = await import("@superset/db/schema");
const { eq } = await import("drizzle-orm");
const { pageCommentRouter } = await import("./page-comment");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const ORG = crypto.randomUUID();
const USER = crypto.randomUUID();
const OTHER_USER = crypto.randomUUID();
const WORKSPACE = crypto.randomUUID();
const suffix = Date.now();

const callerFor = (userId: string) =>
	createCallerFactory(createTRPCRouter({ pageComment: pageCommentRouter }))(
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

/** id of each page, keyed by the label the test refers to it by. */
const pageIds: Record<string, string> = {};
const threadIds: Record<string, string> = {};

async function seedPage(
	label: string,
	{
		visibility,
		owner,
		inWorkspace = false,
	}: {
		visibility: "org" | "just_me";
		owner: string;
		inWorkspace?: boolean;
	},
) {
	const [page] = await db
		.insert(pages)
		.values({
			slug: `comment-sweep-${suffix}-${label}`,
			organizationId: ORG,
			createdByUserId: owner,
			title: `Page ${label}`,
			visibility,
		})
		.returning({ id: pages.id });
	if (!page) throw new Error("failed to insert page");
	pageIds[label] = page.id;

	const [version] = await db
		.insert(pageVersions)
		.values({
			pageId: page.id,
			version: 1,
			storageKey: `pages/${page.id}/1/index.html`,
			contentType: "text/html",
			sizeBytes: 10,
			sha256: createHash("sha256").update(label).digest("hex"),
			createdByUserId: owner,
		})
		.returning({ id: pageVersions.id });
	if (!version) throw new Error("failed to insert version");

	if (inWorkspace) {
		await db.insert(workspacePages).values({
			pageId: page.id,
			workspaceId: WORKSPACE,
			entryPath: `/${label}.html`,
		});
	}

	const [thread] = await db
		.insert(pageCommentThreads)
		.values({
			pageId: page.id,
			pageVersionId: version.id,
			anchorKind: "page",
			anchor: null,
			createdByUserId: owner,
			...(label === "resolved" ? { resolvedAt: new Date() } : {}),
			...(label === "activated" ? { agentActivatedAt: new Date() } : {}),
		})
		.returning({ id: pageCommentThreads.id });
	if (!thread) throw new Error("failed to insert thread");
	threadIds[label] = thread.id;

	await db.insert(pageComments).values({
		threadId: thread.id,
		body: `comment on ${label}`,
		authorKind: "human",
		authorUserId: owner,
	});
}

beforeAll(async () => {
	await db.insert(organizations).values({
		id: ORG,
		name: "Sweep Org",
		slug: `sweep-org-${suffix}`,
	});
	await db.insert(users).values([
		{
			id: USER,
			name: "Sweep User",
			email: `sweep-${suffix}@example.com`,
			organizationIds: [ORG],
		},
		{
			id: OTHER_USER,
			name: "Other User",
			email: `sweep-other-${suffix}@example.com`,
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

	await seedPage("shared", { visibility: "org", owner: OTHER_USER });
	await seedPage("mine", { visibility: "just_me", owner: USER });
	await seedPage("theirs", { visibility: "just_me", owner: OTHER_USER });
	await seedPage("linked", {
		visibility: "org",
		owner: USER,
		inWorkspace: true,
	});
	await seedPage("resolved", { visibility: "org", owner: USER });
	await seedPage("activated", { visibility: "org", owner: USER });
});

afterAll(async () => {
	await db.delete(organizations).where(eq(organizations.id, ORG));
	await db.delete(users).where(eq(users.id, USER));
	await db.delete(users).where(eq(users.id, OTHER_USER));
	// Guarded: the pooled client is shared, so a sibling integration file that
	// already closed it must not fail this teardown.
	await dbWs.$client.end?.().catch(() => {});
});

describe("pageComment.listForOrganization", () => {
	test("sweeps every readable page in one call", async () => {
		const threads = await caller.pageComment.listForOrganization({});
		const ids = threads.map((thread) => thread.id);

		expect(ids).toContain(threadIds.shared);
		expect(ids).toContain(threadIds.mine);
		expect(ids).toContain(threadIds.linked);
	});

	test("applies the same visibility rule page.list does", async () => {
		const threads = await caller.pageComment.listForOrganization({});
		const ids = threads.map((thread) => thread.id);

		// A colleague's `just_me` page is unreadable, so its thread is not listed.
		expect(ids).not.toContain(threadIds.theirs);
		// ...and it is listed for the person who owns it.
		const theirs = await callerFor(OTHER_USER).pageComment.listForOrganization(
			{},
		);
		expect(theirs.map((thread) => thread.id)).toContain(threadIds.theirs);
	});

	test("names the page each thread belongs to, so a sweep can be grouped", async () => {
		const threads = await caller.pageComment.listForOrganization({});
		const shared = threads.find((thread) => thread.id === threadIds.shared);

		expect(shared?.pageTitle).toBe("Page shared");
		expect(shared?.pageSlug).toBe(`comment-sweep-${suffix}-shared`);
		expect(shared?.pageId).toBe(pageIds.shared);
	});

	test("carries the comments, not just the threads", async () => {
		const threads = await caller.pageComment.listForOrganization({});
		const shared = threads.find((thread) => thread.id === threadIds.shared);

		expect(shared?.comments.map((comment) => comment.body)).toEqual([
			"comment on shared",
		]);
	});

	test("narrows to one workspace's pages", async () => {
		const threads = await caller.pageComment.listForOrganization({
			workspaceId: WORKSPACE,
		});

		expect(threads.map((thread) => thread.id)).toEqual([threadIds.linked]);
	});

	test("narrows to unresolved threads", async () => {
		const threads = await caller.pageComment.listForOrganization({
			unresolvedOnly: true,
		});
		const ids = threads.map((thread) => thread.id);

		expect(ids).not.toContain(threadIds.resolved);
		expect(ids).toContain(threadIds.shared);
	});

	test("narrows to the threads an agent was activated on", async () => {
		const threads = await caller.pageComment.listForOrganization({
			activatedOnly: true,
		});

		expect(threads.map((thread) => thread.id)).toEqual([threadIds.activated]);
	});

	test("orders oldest first, the way the per-page list did", async () => {
		const threads = await caller.pageComment.listForOrganization({});
		const stamps = threads.map((thread) =>
			new Date(thread.createdAt).getTime(),
		);

		expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
	});
});
