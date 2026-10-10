import { describe, expect, test } from "bun:test";
import { unfurlLink } from "./linkUnfurl";

const WEB = "https://app.superset.sh";

describe("unfurlLink", () => {
	test.each([
		[
			"https://mail.google.com/mail/u/0/#drafts/abc",
			{ icon: { kind: "plugin", name: "gmail" } },
		],
		[
			"https://github.com/superset-sh/superset/pull/8298",
			{
				icon: { kind: "plugin", name: "github" },
				label: "superset-sh/superset#8298",
			},
		],
		[
			"https://linear.app/superset-sh/issue/SUPER-2617/create-a-mechanism",
			{ icon: { kind: "plugin", name: "linear" }, label: "SUPER-2617" },
		],
		[
			"https://docs.google.com/spreadsheets/d/1/edit",
			{ icon: { kind: "plugin", name: "google-sheets" } },
		],
		[
			"https://acme.slack.com/archives/C1/p2",
			{ icon: { kind: "plugin", name: "slack" } },
		],
		[
			"https://example.com/files/Side%20Letter.pdf",
			{
				icon: { kind: "file", fileName: "Side Letter.pdf" },
				label: "Side Letter.pdf",
			},
		],
		[
			"https://app.superset.sh/page/plugin-page-xy56xt",
			{
				icon: { kind: "plugin", name: "superset" },
				label: "plugin-page-xy56xt",
			},
		],
	])("%s", (href, expected) => {
		expect(unfurlLink(href, false, WEB)).toEqual(expected as never);
	});

	test("unfurls a local file path by its name", () => {
		expect(unfurlLink("/tmp/out/report.pdf", true, WEB)).toEqual({
			icon: { kind: "file", fileName: "report.pdf" },
			label: "report.pdf",
		});
	});

	test("leaves plain web pages and other schemes alone", () => {
		expect(unfurlLink("https://example.com/docs/intro.html", false, WEB)).toBe(
			null,
		);
		expect(unfurlLink("https://example.com/", false, WEB)).toBe(null);
		expect(unfurlLink("mailto:a@b.co", false, WEB)).toBe(null);
		expect(unfurlLink("https://github.com.evil.io/x", false, WEB)).toBe(null);
	});
});
