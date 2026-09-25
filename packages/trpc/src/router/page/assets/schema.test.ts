import { describe, expect, test } from "bun:test";
import { MAX_PAGE_BYTES } from "@superset/shared/page-content-types";
import { MAX_PAGE_ASSET_BYTES, uploadPageFileSchema } from "./schema";

const PAGE = "00000000-0000-4000-8000-000000000001";
const digest = "a".repeat(64);

const document = {
	kind: "document" as const,
	name: "index.html",
	contentType: "text/html",
	sizeBytes: 12,
	sha256: digest,
};

const asset = {
	pageId: PAGE,
	path: "img/chart.png",
	name: "chart.png",
	contentType: "image/png",
	sizeBytes: 12,
	sha256: digest,
};

const parse = (input: Record<string, unknown>) =>
	uploadPageFileSchema.safeParse(input);

const messages = (input: Record<string, unknown>) => {
	const result = parse(input);
	if (result.success) throw new Error("expected a validation failure");
	return result.error.issues.map((issue) => issue.message);
};

describe("a document upload", () => {
	test("declares the document, and is refused the document itself", () => {
		expect(parse(document).success).toBe(true);
		expect(messages({ ...document, content: "PGgxPmhpPC9oMT4=" })).toEqual([
			'Unrecognized key: "content"',
		]);
	});

	test("is HTML — the origin serves nothing else as a page", () => {
		expect(messages({ ...document, contentType: "text/markdown" })).toEqual([
			"A page is an HTML document",
		]);
	});

	test("stops at the page ceiling, which is far below an asset's", () => {
		expect(parse({ ...document, sizeBytes: MAX_PAGE_BYTES }).success).toBe(
			true,
		);
		expect(messages({ ...document, sizeBytes: MAX_PAGE_BYTES + 1 })).toEqual([
			"A page is at most 16 MB",
		]);
		expect(MAX_PAGE_ASSET_BYTES).toBeGreaterThan(MAX_PAGE_BYTES);
	});

	test("has no page and no path to hold in one", () => {
		expect(messages({ ...document, pageId: PAGE, path: "index.html" })).toEqual(
			['Unrecognized keys: "pageId", "path"'],
		);
	});
});

describe("an asset upload", () => {
	test("needs no kind, so a client that predates the document still stages", () => {
		const result = parse(asset);
		expect(result.success && result.data.kind).toBe("asset");
	});

	test("takes the types and sizes a page may carry beside the document", () => {
		expect(parse({ ...asset, sizeBytes: MAX_PAGE_ASSET_BYTES }).success).toBe(
			true,
		);
		expect(
			parse({ ...asset, sizeBytes: MAX_PAGE_ASSET_BYTES + 1 }).success,
		).toBe(false);
	});
});
