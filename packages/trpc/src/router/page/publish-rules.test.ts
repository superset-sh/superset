import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import {
	isVersionConflict,
	MAX_PAGE_BYTES,
	PAGE_CONTENT_TYPES,
	titleFromFilename,
	validatePublishContent,
} from "./publish-rules";

const base64 = (text: string) => Buffer.from(text).toString("base64");

describe("PAGE_CONTENT_TYPES", () => {
	test("is html only — a page is one self-contained file, with no assets beside it", () => {
		expect([...PAGE_CONTENT_TYPES]).toEqual(["text/html"]);
	});
});

describe("titleFromFilename", () => {
	test("drops the extension and un-slugifies the stem", () => {
		expect(titleFromFilename("quarterly-report.html")).toBe("quarterly report");
		expect(titleFromFilename("q3_launch_microsite.html")).toBe(
			"q3 launch microsite",
		);
	});

	test("keeps a dotfile whole rather than reading it as an extension", () => {
		expect(titleFromFilename(".env")).toBe(".env");
	});

	test("handles a filename with no extension", () => {
		expect(titleFromFilename("README")).toBe("README");
	});
});

describe("isVersionConflict", () => {
	test("matches only the version unique violation", () => {
		expect(
			isVersionConflict({
				code: "23505",
				constraint: "page_versions_page_id_version_unique",
			}),
		).toBe(true);
	});

	test("does not retry a different unique violation", () => {
		expect(
			isVersionConflict({ code: "23505", constraint: "pages_slug_unique" }),
		).toBe(false);
	});

	test("does not retry a non-unique error", () => {
		expect(
			isVersionConflict({
				code: "23503",
				constraint: "page_versions_page_id_version_unique",
			}),
		).toBe(false);
		expect(isVersionConflict(new Error("boom"))).toBe(false);
		expect(isVersionConflict(null)).toBe(false);
		expect(isVersionConflict(undefined)).toBe(false);
	});
});

describe("validatePublishContent", () => {
	test("accepts html and returns its digest", () => {
		const { buffer, sha256 } = validatePublishContent({
			content: base64("<h1>hi</h1>"),
			contentType: "text/html",
		});
		expect(buffer.toString()).toBe("<h1>hi</h1>");
		expect(sha256).toHaveLength(64);
	});

	test("rejects an image as a page — those are files now", () => {
		expect(() =>
			validatePublishContent({
				content: base64("\x89PNG"),
				contentType: "image/png",
			}),
		).toThrow(TRPCError);
	});

	test("rejects markdown until the viewer can render it", () => {
		expect(() =>
			validatePublishContent({
				content: base64("# hi"),
				contentType: "text/markdown",
			}),
		).toThrow(TRPCError);
	});

	test("rejects a page over the size cap", () => {
		expect(() =>
			validatePublishContent({
				content: Buffer.alloc(MAX_PAGE_BYTES + 1, 0x61).toString("base64"),
				contentType: "text/html",
			}),
		).toThrow(/too large/i);
	});
});
