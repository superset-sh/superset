import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

/**
 * Publish, end to end, against a real Postgres.
 *
 * Deliberately not named `*.test.ts`: it needs a migrated database and the
 * whole of `env.ts` to validate, so `bun test` would fail at import time in
 * any environment without them. Run it explicitly instead, from the repo root:
 *
 *   BLAXEL_API_KEY=test BLAXEL_REGION=test BLAXEL_SANDBOX_IMAGE=test \
 *   BLAXEL_WORKSPACE=test OPENAI_API_KEY=test \
 *   bun test --env-file=.env ./packages/trpc/src/router/page/publish.integration.ts
 *
 * The leading `./` matters — without it bun treats the argument as a name
 * filter and, finding no `.test.` in it, runs nothing.
 *
 * It creates its own organization and users and deletes them afterwards, so it
 * is safe to re-run, but never point it at a database anyone else is using.
 */

// Vercel Blob is stubbed: the local BLOB_READ_WRITE_TOKEN is a placeholder, so
// real uploads cannot work here. Everything below the blob call — resolution,
// version arithmetic, attachments, dedup, visibility — runs against real
// Postgres.
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
	attachments,
	files,
	members,
	organizations,
	cloudWorkspaces,
	pages,
	pageVersions,
	users,
	v2Projects,
	workspacePages,
} = await import("@superset/db/schema");
const { eq } = await import("drizzle-orm");
const { publishPage } = await import("./publish");

const ORG = crypto.randomUUID();
const USER = crypto.randomUUID();
const OTHER_ORG = crypto.randomUUID();
// A second member of the same organization, for the visibility tests.
const OTHER_USER = crypto.randomUUID();
const WORKSPACE = crypto.randomUUID();
const suffix = Date.now();

const html = (body: string) => Buffer.from(body).toString("base64");

const publish = (input: Record<string, unknown>) =>
	publishPage({
		input: {
			content: html("<h1>hello</h1>"),
			contentType: "text/html",
			filename: "index.html",
			...input,
		} as never,
		organizationId: ORG,
		userId: USER,
	});

beforeAll(async () => {
	await db.insert(organizations).values([
		{ id: ORG, name: "Test Org", slug: `test-org-${suffix}` },
		{ id: OTHER_ORG, name: "Other Org", slug: `other-org-${suffix}` },
	]);
	await db.insert(users).values([
		{
			id: USER,
			name: "Test User",
			email: `test-${suffix}@example.com`,
			organizationIds: [ORG],
		},
		{
			id: OTHER_USER,
			name: "Other Member",
			email: `other-${suffix}@example.com`,
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

describe("publish", () => {
	test("first publish creates a page at v1 with a suffixed slug", async () => {
		const result = await publish({
			title: "Q3 Launch Microsite",
			entryPath: "dist/index.html",
			workspaceId: WORKSPACE,
		});

		expect(result.version).toBe(1);
		expect(result.title).toBe("Q3 Launch Microsite");
		expect(result.slug).toMatch(/^q3-launch-microsite-[a-z0-9]{5}$/);
		expect(result.url).toBe(
			`${process.env.NEXT_PUBLIC_WEB_URL}/p/${result.slug}`,
		);
		expect(result.visibility).toBe("org");
	});

	test("republishing the same entry_path adds v2 to the same page", async () => {
		const first = await publish({
			entryPath: "apps/site/index.html",
			workspaceId: WORKSPACE,
		});
		const second = await publish({
			entryPath: "apps/site/index.html",
			workspaceId: WORKSPACE,
		});

		expect(first.version).toBe(1);
		expect(second.version).toBe(2);
		expect(second.id).toBe(first.id);
		expect(second.slug).toBe(first.slug); // the URL never moves
	});

	test("a different entry_path in the same workspace is a different page", async () => {
		const a = await publish({
			entryPath: "docs/index.html",
			workspaceId: WORKSPACE,
		});
		const b = await publish({
			entryPath: "blog/index.html",
			workspaceId: WORKSPACE,
		});
		expect(b.id).not.toBe(a.id);
		expect(b.version).toBe(1);
	});

	test("retitling on republish moves the title but not the slug", async () => {
		const first = await publish({
			title: "Original",
			entryPath: "rename/index.html",
			workspaceId: WORKSPACE,
		});
		const second = await publish({
			title: "Renamed",
			entryPath: "rename/index.html",
			workspaceId: WORKSPACE,
		});

		expect(second.title).toBe("Renamed");
		expect(second.slug).toBe(first.slug);
	});

	test("omitted metadata leaves the page's existing values alone", async () => {
		const first = await publish({
			title: "Keep Me",
			description: "original description",
			visibility: "just_me",
			entryPath: "keep/index.html",
			workspaceId: WORKSPACE,
		});
		const second = await publish({
			entryPath: "keep/index.html",
			workspaceId: WORKSPACE,
		});

		expect(second.title).toBe("Keep Me");
		expect(second.description).toBe("original description");
		expect(second.visibility).toBe("just_me");
		expect(first.id).toBe(second.id);
	});

	test("pageId targets a page explicitly, ignoring the workspace edge", async () => {
		const target = await publish({
			entryPath: "explicit/a.html",
			workspaceId: WORKSPACE,
		});
		// A different entry_path that would otherwise mint a new page.
		const republished = await publish({
			pageId: target.id,
			entryPath: "explicit/somewhere-else.html",
			workspaceId: WORKSPACE,
		});

		expect(republished.id).toBe(target.id);
		expect(republished.version).toBe(2);
	});

	test("publishing with no workspace creates an unlinked page", async () => {
		const result = await publish({ title: "Unlinked" });
		const links = await db
			.select()
			.from(workspacePages)
			.where(eq(workspacePages.pageId, result.id));
		expect(links).toHaveLength(0);
		expect(result.version).toBe(1);
	});

	test("titles the page from the filename when none is given", async () => {
		const result = await publish({ filename: "quarterly-report.html" });
		expect(result.title).toBe("quarterly report");
		expect(result.slug).toMatch(/^quarterly-report-[a-z0-9]{5}$/);
	});

	test("rejects a non-html content type", async () => {
		expect(publish({ contentType: "image/png" })).rejects.toThrow(
			/Unsupported content type/,
		);
	});

	test("records size and sha256 on the version row", async () => {
		const body = "<h1>digest me</h1>";
		const result = await publish({ content: html(body), title: "Digest" });
		const [row] = await db
			.select()
			.from(pageVersions)
			.where(eq(pageVersions.pageId, result.id));

		expect(row?.sizeBytes).toBe(Buffer.byteLength(body));
		expect(row?.sha256).toHaveLength(64);
		expect(row?.blobPathname).toContain(`pages/${result.id}/1/`);
	});
});

describe("visibility", () => {
	test("refuses to publish a version onto another user's just_me page", async () => {
		const mine = await publish({
			title: "My Private Page",
			visibility: "just_me",
		});

		// Same organization, different member — the org check alone would let
		// this through, which is exactly the hole being closed.
		expect(
			publishPage({
				input: {
					content: html("<h1>overwritten</h1>"),
					contentType: "text/html",
					filename: "index.html",
					pageId: mine.id,
				} as never,
				organizationId: ORG,
				userId: OTHER_USER,
			}),
		).rejects.toThrow(/not found/i);
	});

	test("the creator can still publish to their own just_me page", async () => {
		const mine = await publish({
			title: "Mine To Edit",
			visibility: "just_me",
			entryPath: "private/index.html",
			workspaceId: WORKSPACE,
		});
		const again = await publish({
			pageId: mine.id,
			content: html("<h1>v2</h1>"),
		});
		expect(again.version).toBe(2);
		expect(again.id).toBe(mine.id);
	});

	test("any member can publish to an org page", async () => {
		const shared = await publish({ title: "Shared Org Page" });
		const bySomeoneElse = await publishPage({
			input: {
				content: html("<h1>from a colleague</h1>"),
				contentType: "text/html",
				filename: "index.html",
				pageId: shared.id,
			} as never,
			organizationId: ORG,
			userId: OTHER_USER,
		});
		expect(bySomeoneElse.version).toBe(2);
	});
});

describe("workspace access", () => {
	// A cloud workspace is the case Neon *can* verify, so it is the one with a
	// real boundary to test.
	const makeCloudWorkspace = async (organizationId: string, tag: string) => {
		const [project] = await db
			.insert(v2Projects)
			.values({
				organizationId,
				name: `proj-${tag}`,
				slug: `proj-${tag}`,
			})
			.returning();
		const [row] = await db
			.insert(cloudWorkspaces)
			.values({
				organizationId,
				projectId: project?.id ?? crypto.randomUUID(),
				name: `ws-${tag}`,
				branch: "main",
				providerSandboxId: `sandbox-${tag}-${suffix}`,
			})
			.returning();
		if (!row) throw new Error("failed to insert cloud workspace");
		return row;
	};

	test("accepts a cloud workspace belonging to the caller's org", async () => {
		const ws = await makeCloudWorkspace(ORG, `own-${suffix}`);
		const result = await publish({
			entryPath: "cloud/index.html",
			workspaceId: ws.id,
			title: "Cloud Own",
		});
		expect(result.version).toBe(1);
	});

	test("refuses a cloud workspace belonging to another org", async () => {
		const foreign = await makeCloudWorkspace(OTHER_ORG, `foreign-${suffix}`);
		expect(
			publish({ entryPath: "cloud/other.html", workspaceId: foreign.id }),
		).rejects.toThrow(/not found/i);
	});

	test("still accepts an id Neon has never seen, which is a local workspace", async () => {
		const result = await publish({
			entryPath: "local/index.html",
			workspaceId: crypto.randomUUID(),
			title: "Local Workspace",
		});
		expect(result.version).toBe(1);
	});
});

describe("attachments", () => {
	const makeFile = async (organizationId: string, sha: string) => {
		const [row] = await db
			.insert(files)
			.values({
				organizationId,
				blobPathname: `files/${sha}/logo.png`,
				filename: "logo.png",
				contentType: "image/png",
				sizeBytes: 10,
				sha256: sha,
				createdByUserId: USER,
			})
			.returning();
		if (!row) throw new Error("failed to insert test file");
		return row;
	};

	test("attaches uploaded files to the new version", async () => {
		const file = await makeFile(ORG, `sha-${suffix}-1`);
		const result = await publish({ title: "With Assets", fileIds: [file.id] });

		const [version] = await db
			.select()
			.from(pageVersions)
			.where(eq(pageVersions.pageId, result.id));
		const rows = await db
			.select()
			.from(attachments)
			.where(eq(attachments.parentId, version?.id ?? ""));

		expect(rows).toHaveLength(1);
		expect(rows[0]?.fileId).toBe(file.id);
		expect(rows[0]?.parentKind).toBe("page_version");
	});

	test("refuses to attach a file from another organization", async () => {
		const foreign = await makeFile(OTHER_ORG, `sha-${suffix}-2`);
		expect(
			publish({ title: "Cross Org", fileIds: [foreign.id] }),
		).rejects.toThrow(/not found/i);
	});

	test("attaching the same file twice yields one row", async () => {
		const file = await makeFile(ORG, `sha-${suffix}-3`);
		const result = await publish({
			title: "Dup Attach",
			fileIds: [file.id, file.id],
		});
		const [version] = await db
			.select()
			.from(pageVersions)
			.where(eq(pageVersions.pageId, result.id));
		const rows = await db
			.select()
			.from(attachments)
			.where(eq(attachments.parentId, version?.id ?? ""));
		expect(rows).toHaveLength(1);
	});

	test("each version gets its own attachments, so a pin keeps its assets", async () => {
		const file = await makeFile(ORG, `sha-${suffix}-4`);
		const v1 = await publish({
			entryPath: "pinned/index.html",
			workspaceId: WORKSPACE,
			fileIds: [file.id],
		});
		const v2 = await publish({
			entryPath: "pinned/index.html",
			workspaceId: WORKSPACE,
			fileIds: [file.id],
		});
		expect(v2.version).toBe(2);

		const versions = await db
			.select()
			.from(pageVersions)
			.where(eq(pageVersions.pageId, v1.id));
		expect(versions).toHaveLength(2);

		const attached = await Promise.all(
			versions.map((v) =>
				db.select().from(attachments).where(eq(attachments.parentId, v.id)),
			),
		);
		// Both versions reference the same file; neither depends on the other.
		expect(attached.every((rows) => rows.length === 1)).toBe(true);
	});
});

describe("page rows", () => {
	test("every publish is a new version even for identical bytes", async () => {
		const same = html("<h1>identical</h1>");
		const first = await publish({
			content: same,
			entryPath: "same/index.html",
			workspaceId: WORKSPACE,
		});
		const second = await publish({
			content: same,
			entryPath: "same/index.html",
			workspaceId: WORKSPACE,
		});

		expect(second.version).toBe(2);
		const rows = await db
			.select()
			.from(pageVersions)
			.where(eq(pageVersions.pageId, first.id));
		expect(rows).toHaveLength(2);
		expect(rows[0]?.sha256).toBe(rows[1]?.sha256 ?? "");
	});

	test("slugs are unique across pages sharing a title", async () => {
		const a = await publish({ title: "Same Title" });
		const b = await publish({ title: "Same Title" });
		expect(a.slug).not.toBe(b.slug);

		const all = await db
			.select({ slug: pages.slug })
			.from(pages)
			.where(eq(pages.organizationId, ORG));
		expect(new Set(all.map((r) => r.slug)).size).toBe(all.length);
	});
});
