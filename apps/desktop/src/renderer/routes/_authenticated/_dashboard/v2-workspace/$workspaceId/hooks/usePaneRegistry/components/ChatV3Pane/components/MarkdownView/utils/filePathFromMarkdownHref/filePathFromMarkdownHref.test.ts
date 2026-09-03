import { describe, expect, test } from "bun:test";
import { filePathFromMarkdownHref } from "./filePathFromMarkdownHref";

describe("filePathFromMarkdownHref", () => {
	test.each([
		[
			"/Users/dev/project/artifacts/preview.png",
			"/Users/dev/project/artifacts/preview.png",
		],
		["artifacts/preview.png", "artifacts/preview.png"],
		["./artifacts/preview.png", "./artifacts/preview.png"],
		["../shared/preview.png", "../shared/preview.png"],
		["~/Downloads/preview.png", "~/Downloads/preview.png"],
		["C:\\project\\preview.png", "C:\\project\\preview.png"],
		["file:///Users/dev/preview.png", "file:///Users/dev/preview.png"],
		["artifacts/my%20preview.png", "artifacts/my preview.png"],
		["artifacts/name%23one.png#preview", "artifacts/name#one.png"],
	])("recognizes local file href %s", (href, expected) => {
		expect(filePathFromMarkdownHref(href)).toBe(expected);
	});

	test.each([
		undefined,
		"",
		"#section",
		"//example.com/image.png",
		"https://example.com/image.png",
		"mailto:hello@example.com",
		"data:image/png;base64,abc",
		"streamdown:incomplete-link",
	])("keeps non-file href %s on the regular link path", (href) => {
		expect(filePathFromMarkdownHref(href)).toBeNull();
	});

	test("preserves a malformed percent escape for host-side resolution", () => {
		expect(filePathFromMarkdownHref("artifacts/100%.png")).toBe(
			"artifacts/100%.png",
		);
	});
});
