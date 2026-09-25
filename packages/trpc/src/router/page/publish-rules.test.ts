import { describe, expect, test } from "bun:test";
import {
	isVersionConflict,
	titleFromFilename,
	validateAssetPaths,
} from "./publish-rules";

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

describe("validateAssetPaths", () => {
	const ok = (path: string) =>
		expect(() => validateAssetPaths([{ path }])).not.toThrow();
	const bad = (path: string) =>
		expect(() => validateAssetPaths([{ path }])).toThrow();

	test("accepts ordinary relative paths", () => {
		ok("demo.mp4");
		ok("img/chart.png");
		ok("styles/site.css");
		ok("versions.png");
	});

	test("refuses escapes, reserved shapes, and shadows", () => {
		bad("/abs.png");
		bad("../up.png");
		bad("a/../b.png");
		bad("a//b.png");
		bad("versions/1/x.png");
		bad("files/abc");
		bad("_superset/runtime.js");
		bad("~ticket/x.png");
		bad("index.html");
		bad("thumbnail.jpg");
	});

	test("refuses duplicates", () => {
		expect(() =>
			validateAssetPaths([{ path: "a.png" }, { path: "a.png" }]),
		).toThrow();
	});
});
