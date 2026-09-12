import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";

const objectStore = new Map<string, Uint8Array | string>();
mock.module("../../lib/r2", () => ({
	putObject: async ({
		key,
		body,
	}: {
		key: string;
		body: Uint8Array | string;
	}) => {
		objectStore.set(key, body);
	},
	objectExists: async (key: string) => objectStore.has(key),
	getObject: async (key: string) =>
		objectStore.has(key) ? new Response(objectStore.get(key)) : null,
	headObject: async (key: string) => {
		const body = objectStore.get(key);
		if (body === undefined) return null;
		return {
			sizeBytes:
				typeof body === "string" ? Buffer.byteLength(body) : body.length,
			contentType: null,
		};
	},
	copyObject: async ({
		sourceKey,
		key,
	}: {
		sourceKey: string;
		key: string;
	}) => {
		const body = objectStore.get(sourceKey);
		if (body === undefined) throw new Error(`NoSuchKey: ${sourceKey}`);
		objectStore.set(key, body);
	},
	deleteObjects: async (keys: string[]) => {
		for (const key of keys) objectStore.delete(key);
	},
	presignedGetUrl: async (key: string) => {
		if (!objectStore.has(key)) throw new Error("object not found");
		return `https://storage.test/${key}`;
	},
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
const { fileOriginalKey } = await import("@superset/shared/usercontent");
const { MAX_PAGE_BYTES } = await import("@superset/shared/page-content-types");
const { eq } = await import("drizzle-orm");
const { publishPage } = await import("./publish");

const ORG = crypto.randomUUID();
const USER = crypto.randomUUID();
const OTHER_ORG = crypto.randomUUID();
const OTHER_USER = crypto.randomUUID();
const WORKSPACE = crypto.randomUUID();
const suffix = Date.now();

/**
 * What an upload of `kind: "document"` plus the client's PUT leave behind: a
 * pending file row for this caller and, unless told otherwise, the bytes
 * under its key.
 */
const upload = async (
	body: string,
	{
		landed = body,
		userId = USER,
		contentType = "text/html",
		sizeBytes,
	}: {
		landed?: string | null;
		userId?: string;
		contentType?: string;
		sizeBytes?: number;
	} = {},
) => {
	const bytes = Buffer.from(body);
	const [row] = await db
		.insert(files)
		.values({
			organizationId: ORG,
			name: "index.html",
			contentType,
			sizeBytes: sizeBytes ?? bytes.length,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			createdByUserId: userId,
		})
		.returning({ id: files.id, sha256: files.sha256 });
	if (!row) throw new Error("failed to insert file");
	if (landed !== null) objectStore.set(fileOriginalKey(row.id), landed);
	return row;
};

/** Uploads a document and publishes it, the way every client does. */
const publish = async ({
	body = "<h1>hello</h1>",
	userId = USER,
	fileId,
	...input
}: Record<string, unknown> & {
	body?: string;
	userId?: string;
	fileId?: string;
} = {}) => {
	const staged = fileId ?? (await upload(body, { userId })).id;
	return await publishPage({
		input: { fileId: staged, filename: "index.html", ...input } as never,
		organizationId: ORG,
		userId,
	});
};

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
		expect(result.slug).toMatch(/^q3-launch-microsite-[a-z0-9]{6}$/);
		expect(result.url).toBe(
			`${process.env.NEXT_PUBLIC_WEB_URL}/page/${result.slug}`,
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
		expect(second.slug).toBe(first.slug);
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

	test("republishing moves updatedAt, so list ordering resurfaces it", async () => {
		const first = await publish({
			title: "Bumped",
			entryPath: "bump/index.html",
			workspaceId: WORKSPACE,
		});
		const [before] = await db
			.select({ updatedAt: pages.updatedAt })
			.from(pages)
			.where(eq(pages.id, first.id));

		await publish({ entryPath: "bump/index.html", workspaceId: WORKSPACE });

		const [after] = await db
			.select({ updatedAt: pages.updatedAt })
			.from(pages)
			.where(eq(pages.id, first.id));
		expect(after?.updatedAt.getTime()).toBeGreaterThan(
			before?.updatedAt.getTime() ?? 0,
		);
	});

	test("pageId targets a page explicitly, ignoring the workspace edge", async () => {
		const target = await publish({
			entryPath: "explicit/a.html",
			workspaceId: WORKSPACE,
		});
		const republished = await publish({
			pageId: target.id,
			entryPath: "explicit/somewhere-else.html",
			workspaceId: WORKSPACE,
		});

		expect(republished.id).toBe(target.id);
		expect(republished.version).toBe(2);
	});

	test("pageId does not bind the entry_path to the targeted page", async () => {
		const target = await publish({ title: "One Off Target" });
		await publish({
			pageId: target.id,
			entryPath: "oneoff/index.html",
			workspaceId: WORKSPACE,
		});

		const links = await db
			.select()
			.from(workspacePages)
			.where(eq(workspacePages.entryPath, "oneoff/index.html"));
		expect(links).toHaveLength(0);

		const plain = await publish({
			entryPath: "oneoff/index.html",
			workspaceId: WORKSPACE,
			title: "Its Own Page",
		});
		expect(plain.id).not.toBe(target.id);
		expect(plain.version).toBe(1);
	});

	test("a colleague's entry path collides instead of minting an orphan", async () => {
		const theirs = await publish({
			entryPath: "shared/index.html",
			workspaceId: WORKSPACE,
			title: "Theirs",
		});

		// The republish lookup only matches the caller's own pages, so theirs is
		// invisible here and a new page is minted before the link is attempted.
		await expect(
			publish({
				body: "<h1>mine</h1>",
				userId: OTHER_USER,
				entryPath: "shared/index.html",
				workspaceId: WORKSPACE,
			}),
		).rejects.toThrow(/already published/i);

		// The whole publish rolls back: no second page, and the link still theirs.
		const links = await db
			.select()
			.from(workspacePages)
			.where(eq(workspacePages.entryPath, "shared/index.html"));
		expect(links).toHaveLength(1);
		expect(links[0]?.pageId).toBe(theirs.id);
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
		expect(result.slug).toMatch(/^quarterly-report-[a-z0-9]{6}$/);
	});
});

describe("visibility", () => {
	test("refuses to publish a version onto another user's just_me page", async () => {
		const mine = await publish({
			title: "My Private Page",
			visibility: "just_me",
		});

		await expect(
			publish({
				body: "<h1>overwritten</h1>",
				userId: OTHER_USER,
				pageId: mine.id,
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
		const again = await publish({ pageId: mine.id, body: "<h1>v2</h1>" });
		expect(again.version).toBe(2);
		expect(again.id).toBe(mine.id);
	});

	// Readable to the org, still writable only by its creator: a colleague adding
	// a version would silently rewrite what the author's link serves.
	test("a colleague cannot publish a version onto an org page", async () => {
		const shared = await publish({
			title: "Shared Org Page",
			visibility: "org",
		});
		expect(
			publish({
				body: "<h1>from a colleague</h1>",
				userId: OTHER_USER,
				pageId: shared.id,
			}),
		).rejects.toThrow(/only the person who created/i);
	});
});

describe("workspace access", () => {
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
		await expect(
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

describe("uploaded document", () => {
	test("publishes from the upload: the version carries its declared digest, the bytes are copied under the version key, and the upload is consumed", async () => {
		const body = "<h1>uploaded</h1>";
		const staged = await upload(body);
		const result = await publish({ fileId: staged.id, title: "From Upload" });

		expect(result.version).toBe(1);
		expect(result.sizeBytes).toBe(Buffer.byteLength(body));
		expect(result.contentType).toBe("text/html");
		const [row] = await db
			.select()
			.from(pageVersions)
			.where(eq(pageVersions.pageId, result.id));
		expect(row?.sha256).toBe(staged.sha256);
		expect(row?.storageKey).toBe(`pages/${result.id}/versions/1/index.html`);
		expect(objectStore.get(row?.storageKey ?? "")).toBe(body);

		// Consumed: the staged object and its row are both gone, so the same
		// upload cannot become a second version.
		expect(objectStore.has(fileOriginalKey(staged.id))).toBe(false);
		const rows = await db.select().from(files).where(eq(files.id, staged.id));
		expect(rows).toHaveLength(0);
	});

	test("refuses an upload whose bytes never landed", async () => {
		const staged = await upload("<h1>ghost</h1>", { landed: null });
		await expect(publish({ fileId: staged.id })).rejects.toThrow(
			/never uploaded/i,
		);
	});

	test("refuses an upload whose object differs in size from what it declared", async () => {
		const staged = await upload("<h1>declared</h1>", {
			landed: "<h1>something longer than declared</h1>",
		});
		await expect(publish({ fileId: staged.id })).rejects.toThrow(
			/does not match the size/i,
		);
	});

	test("a colleague's upload is not mine to publish", async () => {
		const theirs = await upload("<h1>theirs</h1>", { userId: OTHER_USER });
		await expect(publish({ fileId: theirs.id })).rejects.toThrow(
			/upload not found/i,
		);
	});

	test("a staged asset is not a document, even when it is html", async () => {
		const page = await publish({ title: "Has Assets" });
		const asset = await upload("<p>about</p>");
		await db.insert(attachments).values({
			fileId: asset.id,
			parentKind: "page",
			parentId: page.id,
			path: "about.html",
		});
		await expect(
			publish({ fileId: asset.id, pageId: page.id }),
		).rejects.toThrow(/upload not found/i);
	});

	test("an asset that lost its staging cannot smuggle in a page over the cap", async () => {
		const detached = await upload("<h1>huge</h1>", {
			sizeBytes: MAX_PAGE_BYTES + 1,
		});
		await expect(publish({ fileId: detached.id })).rejects.toThrow(
			/upload not found/i,
		);
	});

	test("a file uploaded as something other than html is refused", async () => {
		const staged = await upload("\x89PNG", { contentType: "image/png" });
		await expect(publish({ fileId: staged.id })).rejects.toThrow(
			/upload not found/i,
		);
	});
});

describe("page rows", () => {
	test("every publish is a new version even for identical bytes", async () => {
		const same = "<h1>identical</h1>";
		const first = await publish({
			body: same,
			entryPath: "same/index.html",
			workspaceId: WORKSPACE,
		});
		const second = await publish({
			body: same,
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
