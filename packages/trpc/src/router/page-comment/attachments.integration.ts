import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

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
	copyObject: async () => {},
	deleteObjects: async (keys: string[]) => {
		for (const key of keys) objectStore.delete(key);
	},
	presignedGetUrl: async (key: string) => `https://storage.test/${key}`,
	presignedPutUrl: async ({ key }: { key: string }) => ({
		url: `https://storage.test/${key}`,
		headers: {},
	}),
}));

const { db, dbWs } = await import("@superset/db/client");
const {
	attachments,
	files,
	members,
	organizations,
	pages,
	pageVersions,
	users,
} = await import("@superset/db/schema");
const { fileOriginalKey } = await import("@superset/shared/usercontent");
const { eq, and } = await import("drizzle-orm");
const { pageCommentRouter } = await import("./page-comment");
const { pageRouter } = await import("../page/page");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const ORG = crypto.randomUUID();
const USER = crypto.randomUUID();
const OTHER_USER = crypto.randomUUID();
const PAGE = crypto.randomUUID();
const suffix = Date.now();

/** Enough of a PNG for the sniffer: the signature, padded to a real size. */
const PNG_BYTES = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
	0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
]);
const HTML_BYTES = new TextEncoder().encode("<html><body>hi</body></html>");

const callerFor = (userId: string) =>
	createCallerFactory(
		createTRPCRouter({ pageComment: pageCommentRouter, page: pageRouter }),
	)(
		createTRPCContext({
			session: {
				user: { id: userId, email: `${userId}@example.com` },
				session: { activeOrganizationId: ORG },
			} as never,
			auth: {} as never,
			headers: new Headers(),
		}),
	);

const caller = callerFor(USER);

/** The client's whole upload leg: record it, then PUT the bytes (or not). */
const uploadImage = async ({
	bytes = PNG_BYTES,
	landed = bytes,
	contentType = "image/png",
	as = caller,
}: {
	bytes?: Uint8Array;
	landed?: Uint8Array | null;
	contentType?: string;
	as?: ReturnType<typeof callerFor>;
} = {}) => {
	const { fileId } = await as.pageComment.createImageUpload({
		pageId: PAGE,
		name: "screenshot.png",
		contentType,
		sizeBytes: bytes.length,
		sha256: "ab".repeat(32),
	});
	if (landed !== null) objectStore.set(fileOriginalKey(fileId), landed);
	return fileId;
};

const createThread = (attachmentIds: string[], body = "look at this") =>
	caller.pageComment.create({
		pageId: PAGE,
		version: 1,
		anchorKind: "page",
		anchor: null,
		anchorText: null,
		body,
		attachments: attachmentIds,
	});

beforeAll(async () => {
	await db
		.insert(organizations)
		.values([{ id: ORG, name: "Test Org", slug: `test-org-att-${suffix}` }]);
	await db.insert(users).values([
		{
			id: USER,
			name: "Test User",
			email: `att-${suffix}@example.com`,
			organizationIds: [ORG],
		},
		{
			id: OTHER_USER,
			name: "Other Member",
			email: `att-other-${suffix}@example.com`,
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
	await db.insert(pages).values({
		id: PAGE,
		slug: `commented-page-${suffix}`,
		organizationId: ORG,
		createdByUserId: USER,
		title: "Commented Page",
		visibility: "org",
	});
	await db.insert(pageVersions).values({
		pageId: PAGE,
		version: 1,
		storageKey: `pages/${PAGE}/versions/1/index.html`,
		contentType: "text/html",
		sizeBytes: 10,
		sha256: "cd".repeat(32),
		createdByUserId: USER,
	});
});

afterAll(async () => {
	await db.delete(organizations).where(eq(organizations.id, ORG));
	await db.delete(users).where(eq(users.id, USER));
	await db.delete(users).where(eq(users.id, OTHER_USER));
	await dbWs.$client.end?.();
});

const fileRow = async (fileId: string) => {
	const [row] = await db.select().from(files).where(eq(files.id, fileId));
	return row ?? null;
};

describe("attaching images to comments", () => {
	test("a thread carries its image, verified and served by ticket", async () => {
		// Declared as JPEG on purpose: the stored type must come from the bytes.
		const fileId = await uploadImage({ contentType: "image/jpeg" });
		const thread = await createThread([fileId]);

		const [attachment] = thread.comments[0]?.attachments ?? [];
		expect(attachment?.fileId).toBe(fileId);
		expect(attachment?.contentType).toBe("image/png");
		expect(attachment?.url).toContain(`/files/${fileId}/`);
		expect(attachment?.url).toContain("ticket=");

		const file = await fileRow(fileId);
		expect(file?.status).toBe("ready");
		expect(file?.contentType).toBe("image/png");
		const [parent] = await db
			.select()
			.from(attachments)
			.where(eq(attachments.fileId, fileId));
		expect(parent?.parentKind).toBe("comment");
		expect(parent?.parentId).toBe(thread.comments[0]?.id);
	});

	test("a reply carries images, and list serves them back", async () => {
		const thread = await createThread([]);
		const fileId = await uploadImage();
		const reply = await caller.pageComment.reply({
			threadId: thread.id,
			body: "",
			attachments: [fileId],
		});
		expect(reply.attachments[0]?.fileId).toBe(fileId);

		const listed = await caller.pageComment.list({ pageId: PAGE });
		const listedReply = listed
			.find((row) => row.id === thread.id)
			?.comments.find((comment) => comment.id === reply.id);
		expect(listedReply?.attachments[0]?.fileId).toBe(fileId);
		expect(listedReply?.attachments[0]?.url).toContain("ticket=");
	});

	test("bytes that are not an image are refused, whatever was declared", async () => {
		const fileId = await uploadImage({ bytes: HTML_BYTES });
		await expect(createThread([fileId])).rejects.toThrow(
			"Only images can be attached",
		);
		expect((await fileRow(fileId))?.status).toBe("pending");
	});

	test("an upload whose bytes never landed is refused", async () => {
		const fileId = await uploadImage({ landed: null });
		await expect(createThread([fileId])).rejects.toThrow(
			"send the bytes first",
		);
	});

	test("someone else's upload is not attachable", async () => {
		const foreign = await uploadImage({ as: callerFor(OTHER_USER) });
		await expect(createThread([foreign])).rejects.toThrow("Image not found");
	});

	test("a file attaches once", async () => {
		const fileId = await uploadImage();
		await createThread([fileId]);
		await expect(createThread([fileId])).rejects.toThrow("Image not found");
	});

	test("deleting a thread reaps its images, bytes included", async () => {
		const fileId = await uploadImage();
		const thread = await createThread([fileId]);
		await caller.pageComment.delete({ threadId: thread.id });

		expect(await fileRow(fileId)).toBeNull();
		expect(objectStore.has(fileOriginalKey(fileId))).toBe(false);
		const rows = await db
			.select()
			.from(attachments)
			.where(
				and(
					eq(attachments.parentKind, "comment"),
					eq(attachments.fileId, fileId),
				),
			);
		expect(rows).toHaveLength(0);
	});

	test("deleting the page reaps comment images with it", async () => {
		const fileId = await uploadImage();
		await createThread([fileId]);
		await caller.page.delete({ id: PAGE });

		expect(await fileRow(fileId)).toBeNull();
		expect(objectStore.has(fileOriginalKey(fileId))).toBe(false);
	});
});
