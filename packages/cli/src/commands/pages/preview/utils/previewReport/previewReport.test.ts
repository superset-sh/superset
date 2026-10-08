import { describe, expect, test } from "bun:test";
import type { PreviewFindings } from "../capturePreview";
import { formatPreviewReport, previewIssues } from "./previewReport";

function findings(overrides: Partial<PreviewFindings> = {}): PreviewFindings {
	return {
		captures: [
			{
				width: 1280,
				theme: "light",
				path: "/tmp/a.jpg",
				pageHeight: 3200,
				capturedHeight: 1568,
			},
			{
				width: 390,
				theme: "light",
				path: "/tmp/b.jpg",
				pageHeight: 600,
				capturedHeight: 600,
			},
		],
		consoleErrors: [],
		blocked: [],
		overflow: [],
		sameInBothThemes: [],
		title: "Page",
		...overrides,
	};
}

describe("previewIssues", () => {
	test("reports each mechanical check that failed", () => {
		const issues = previewIssues(
			findings({
				consoleErrors: [
					"Uncaught TypeError: x is undefined",
					"Uncaught TypeError: x is undefined",
				],
				blocked: ["Refused to load the script 'https://cdn.example/x.js'"],
				overflow: ["390 dark"],
				sameInBothThemes: [1280],
				title: "",
			}),
			{ missing: ["/after.png"], bytes: 17 * 1024 * 1024 },
		);
		expect(issues).toEqual([
			"console errors: Uncaught TypeError: x is undefined",
			"blocked by the page content policy: Refused to load the script 'https://cdn.example/x.js'",
			"files the page asked for that do not exist: /after.png",
			"the page scrolls sideways at 390 dark: give wide content an sp-scroll wrapper",
			'light and dark look identical at 1280: put class="auto" on <body> unless the page is meant for one theme',
			"the page has no <title>",
			"the document is 17.0 MB; pages are limited to 16 MB",
		]);
	});
});

describe("formatPreviewReport", () => {
	test("fences page-produced text and lists every capture with its extent", () => {
		const report = formatPreviewReport({
			name: "index.html",
			bytes: 2048,
			widths: [1280, 390],
			themes: ["light"],
			findings: findings(),
			issues: ["console errors: boom"],
			token: "abcd1234",
		});
		expect(report).toContain("2 of 2 captures, 1 issue found");
		expect(report).toContain("=== BEGIN PREVIEW REPORT abcd1234");
		expect(report).toContain(
			"1. 1280 light (top 1568px of a 3200px page): /tmp/a.jpg",
		);
		expect(report).toContain("2. 390 light (whole page, 600px): /tmp/b.jpg");
		expect(report.indexOf("- console errors: boom")).toBeLessThan(
			report.indexOf("=== END PREVIEW REPORT abcd1234"),
		);
	});
});
