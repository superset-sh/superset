import { describe, expect, test } from "bun:test";
import {
	createCommentImageUploadSchema,
	createPageCommentThreadSchema,
	replyPageCommentSchema,
} from "./schema";

const uuid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const pageThread = (overrides: Record<string, unknown> = {}) => ({
	pageId: uuid(1),
	version: 1,
	anchorKind: "page",
	anchor: null,
	anchorText: null,
	body: "words",
	...overrides,
});

describe("comment content", () => {
	test("text alone is enough", () => {
		expect(createPageCommentThreadSchema.safeParse(pageThread()).success).toBe(
			true,
		);
		expect(
			replyPageCommentSchema.safeParse({ threadId: uuid(2), body: "ok" })
				.success,
		).toBe(true);
	});

	test("an image alone is enough", () => {
		expect(
			createPageCommentThreadSchema.safeParse(
				pageThread({ body: "", attachments: [uuid(3)] }),
			).success,
		).toBe(true);
		expect(
			replyPageCommentSchema.safeParse({
				threadId: uuid(2),
				body: "",
				attachments: [uuid(3)],
			}).success,
		).toBe(true);
	});

	test("neither is not a comment", () => {
		expect(
			createPageCommentThreadSchema.safeParse(pageThread({ body: "  " }))
				.success,
		).toBe(false);
		expect(
			replyPageCommentSchema.safeParse({
				threadId: uuid(2),
				body: "",
				attachments: [],
			}).success,
		).toBe(false);
	});
});

describe("comment attachments", () => {
	test("the same image cannot be attached twice", () => {
		expect(
			replyPageCommentSchema.safeParse({
				threadId: uuid(2),
				body: "",
				attachments: [uuid(3), uuid(3)],
			}).success,
		).toBe(false);
	});

	test("caps how many a comment carries", () => {
		expect(
			replyPageCommentSchema.safeParse({
				threadId: uuid(2),
				body: "",
				attachments: [uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)],
			}).success,
		).toBe(false);
	});
});

describe("image upload", () => {
	const upload = (overrides: Record<string, unknown> = {}) => ({
		pageId: uuid(1),
		name: "screenshot.png",
		contentType: "image/png",
		sizeBytes: 1024,
		sha256: "ab".repeat(32),
		...overrides,
	});

	test("accepts a declared image", () => {
		expect(createCommentImageUploadSchema.safeParse(upload()).success).toBe(
			true,
		);
	});

	test("refuses a non-image declaration before the bytes move", () => {
		expect(
			createCommentImageUploadSchema.safeParse(
				upload({ contentType: "application/pdf" }),
			).success,
		).toBe(false);
	});

	test("refuses an oversize declaration", () => {
		expect(
			createCommentImageUploadSchema.safeParse(
				upload({ sizeBytes: 11 * 1024 * 1024 }),
			).success,
		).toBe(false);
	});

	test("requires a content hash", () => {
		expect(
			createCommentImageUploadSchema.safeParse(upload({ sha256: "" })).success,
		).toBe(false);
		expect(
			createCommentImageUploadSchema.safeParse(upload({ sha256: "xyz" }))
				.success,
		).toBe(false);
	});
});
