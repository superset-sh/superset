import { describe, expect, test } from "bun:test";
import {
	listPagesSchema,
	PAGE_LIST_DEFAULT_LIMIT,
	PAGE_LIST_MAX_IDS,
	PAGE_LIST_MAX_LIMIT,
	publishPageSchema,
	reportPageSchema,
	reviewPageReportSchema,
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

	test("accepts a publish anchored to nothing", () => {
		expect(publishPageSchema.safeParse(base).success).toBe(true);
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

	test("treats an empty or blank search as no search, not as match-everything", () => {
		expect(listPagesSchema.parse({ search: "" })?.search).toBeUndefined();
		expect(listPagesSchema.parse({ search: "   " })?.search).toBeUndefined();
	});

	test("trims a search so a stray space does not change the query", () => {
		expect(listPagesSchema.parse({ search: "  report " })?.search).toBe(
			"report",
		);
	});

	test("takes the cursor as an opaque string", () => {
		const cursor = Buffer.from("whatever the server emitted").toString(
			"base64url",
		);
		expect(listPagesSchema.parse({ cursor })?.cursor).toBe(cursor);
	});

	test("refuses a cursor that is not a string, so the keyset stays private", () => {
		expect(
			listPagesSchema.safeParse({
				cursor: { updatedAt: "2026-09-14 10:00:00+00", id: PAGE },
			}).success,
		).toBe(false);
	});

	test("defaults scope to all and refuses one it does not filter on", () => {
		expect(listPagesSchema.parse({})?.scope).toBe("all");
		expect(listPagesSchema.safeParse({ scope: "pinned" }).success).toBe(false);
	});

	test("accepts an ids filter up to the pin cap and refuses more", () => {
		const ids = Array.from({ length: PAGE_LIST_MAX_IDS }, () => PAGE);
		expect(listPagesSchema.safeParse({ ids }).success).toBe(true);
		expect(listPagesSchema.safeParse({ ids: [...ids, PAGE] }).success).toBe(
			false,
		);
	});

	test("accepts an empty ids filter — no pins is not no filter", () => {
		expect(listPagesSchema.parse({ ids: [] })?.ids).toEqual([]);
	});

	test("refuses an authorId that is not a uuid", () => {
		expect(listPagesSchema.safeParse({ authorId: "nope" }).success).toBe(false);
	});
});

describe("reportPageSchema", () => {
	const base = { slug: "sunlit-harbor-42", reason: "malware_or_phishing" };

	test("a slug and a reason are enough — reporting must not need an account", () => {
		expect(reportPageSchema.safeParse(base).success).toBe(true);
	});

	test("refuses a reason outside the offered list", () => {
		expect(
			reportPageSchema.safeParse({ ...base, reason: "i_dislike_it" }).success,
		).toBe(false);
	});

	test("refuses details longer than the column expects", () => {
		expect(
			reportPageSchema.safeParse({ ...base, details: "x".repeat(4001) })
				.success,
		).toBe(false);
	});

	test("refuses a reporter email that is not an address", () => {
		expect(
			reportPageSchema.safeParse({ ...base, reporterEmail: "nope" }).success,
		).toBe(false);
	});
});

describe("reviewPageReportSchema", () => {
	const REPORT = "00000000-0000-4000-8000-000000000004";

	test("a review resolves to upheld or dismissed, never back to open", () => {
		expect(
			reviewPageReportSchema.safeParse({ id: REPORT, status: "upheld" })
				.success,
		).toBe(true);
		expect(
			reviewPageReportSchema.safeParse({ id: REPORT, status: "open" }).success,
		).toBe(false);
	});
});
