import { describe, expect, test } from "bun:test";
import {
	listPagesSchema,
	PAGE_LIST_DEFAULT_LIMIT,
	PAGE_LIST_MAX_LIMIT,
	publishPageSchema,
} from "./schema";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const PAGE = "00000000-0000-4000-8000-000000000002";
const FILE = "00000000-0000-4000-8000-000000000003";

const base = { fileId: FILE, filename: "index.html" };

describe("publishPageSchema", () => {
	// Carries a valid upload as well, so the body is what it is refused for.
	test("refuses the document in the body, as clients before the upload sent it", () => {
		expect(
			publishPageSchema.safeParse({
				...base,
				pageId: PAGE,
				content: Buffer.from("<!doctype html>").toString("base64"),
				contentType: "text/html",
			}).success,
		).toBe(false);
	});

	test("rejects a publish anchored to nothing", () => {
		const result = publishPageSchema.safeParse(base);
		if (result.success) throw new Error("expected a validation failure");
		expect(result.error.issues[0]?.message).toBe(
			"A publish must name where it lives: pass workspaceId and entryPath, or pageId to add a version to an existing page",
		);
	});

	test("accepts a publish anchored by pageId alone", () => {
		expect(publishPageSchema.safeParse({ ...base, pageId: PAGE }).success).toBe(
			true,
		);
	});

	test("accepts pageId carrying a workspace id but no entry path", () => {
		expect(
			publishPageSchema.safeParse({
				...base,
				pageId: PAGE,
				workspaceId: WORKSPACE,
			}).success,
		).toBe(true);
	});

	test("accepts a publish carrying both link fields", () => {
		expect(
			publishPageSchema.safeParse({
				...base,
				workspaceId: WORKSPACE,
				entryPath: "site/index.html",
			}).success,
		).toBe(true);
	});

	test("rejects entryPath without workspaceId", () => {
		const result = publishPageSchema.safeParse({
			...base,
			entryPath: "site/index.html",
		});
		if (result.success) throw new Error("expected a validation failure");
		expect(result.error.issues[0]?.message).toBe(
			"workspaceId and entryPath must be provided together",
		);
	});

	test("rejects workspaceId without entryPath", () => {
		expect(
			publishPageSchema.safeParse({ ...base, workspaceId: WORKSPACE }).success,
		).toBe(false);
	});

	test("tolerates a stray entryPath once pageId anchors the publish", () => {
		expect(
			publishPageSchema.safeParse({
				...base,
				pageId: PAGE,
				entryPath: "site/index.html",
			}).success,
		).toBe(true);
	});
});

describe("listPagesSchema", () => {
	test("defaults the limit when an input object omits it", () => {
		const result = listPagesSchema.parse({});
		expect(result?.limit).toBe(PAGE_LIST_DEFAULT_LIMIT);
	});

	test("still accepts the no-argument call the CLI and MCP tools make", () => {
		expect(listPagesSchema.parse(undefined)).toBeUndefined();
	});

	test("refuses a limit past the ceiling", () => {
		expect(
			listPagesSchema.safeParse({ limit: PAGE_LIST_MAX_LIMIT + 1 }).success,
		).toBe(false);
	});

	test("refuses an empty search rather than matching everything", () => {
		expect(listPagesSchema.safeParse({ search: "" }).success).toBe(false);
	});

	test("keeps the cursor timestamp as Postgres reported it, microseconds and all", () => {
		const result = listPagesSchema.parse({
			cursor: { updatedAt: "2026-09-14 10:00:00.123456+00", id: PAGE },
		});
		expect(result?.cursor?.updatedAt).toBe("2026-09-14 10:00:00.123456+00");
	});

	test("refuses half a cursor", () => {
		expect(listPagesSchema.safeParse({ cursor: { id: PAGE } }).success).toBe(
			false,
		);
	});

	test("refuses a timestamp Postgres would reject, rather than passing it to the cast", () => {
		expect(
			listPagesSchema.safeParse({
				cursor: { updatedAt: "not-a-timestamp", id: PAGE },
			}).success,
		).toBe(false);
	});

	test("accepts the offsets Postgres emits, whole-hour and half-hour alike", () => {
		for (const updatedAt of [
			"2026-09-14 10:00:00+00",
			"2026-09-14 10:00:00.123456+05:30",
			"2026-09-14 10:00:00.1-08",
		]) {
			expect(
				listPagesSchema.safeParse({ cursor: { updatedAt, id: PAGE } }),
			).toMatchObject({ success: true });
		}
	});
});
