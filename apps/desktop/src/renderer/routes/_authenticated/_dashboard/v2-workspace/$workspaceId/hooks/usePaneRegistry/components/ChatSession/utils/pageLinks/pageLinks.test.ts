import { describe, expect, test } from "bun:test";
import { pageLinkFinder } from "./pageLinks";

const WEB_URL = "https://app.superset.sh";
const REPORT = `${WEB_URL}/page/quarterly-report-a3f9k`;
const PLAN = `${WEB_URL}/page/launch-plan-b7c2d`;

const find = pageLinkFinder(WEB_URL);

function slugs(text: string): string[] {
	return find(text).map((link) => link.slug);
}

describe("pageLinkFinder", () => {
	test("finds a bare page link and keeps its URL", () => {
		expect(find(`Here is the page: ${REPORT}`)).toEqual([
			{ slug: "quarterly-report-a3f9k", url: REPORT },
		]);
	});

	test.each([
		["a markdown link", `See [the report](${REPORT}) for details.`],
		["an autolink", `See <${REPORT}>.`],
		["a sentence end", `It is at ${REPORT}.`],
		["bold text", `**${REPORT}**`],
		["inline code", `Published \`${REPORT}\``],
		["a JSON value", `{"url":"${REPORT}"}`],
		["coloured terminal output", `\u001b[34m${REPORT}\u001b[0m\n`],
	])("reads the link out of %s", (_name, text) => {
		expect(slugs(text)).toEqual(["quarterly-report-a3f9k"]);
	});

	test("lists a page once however often it is linked", () => {
		expect(slugs(`[${REPORT}](${REPORT}) and again ${REPORT}?v=2`)).toEqual([
			"quarterly-report-a3f9k",
		]);
	});

	test("keeps distinct pages in the order they are first linked", () => {
		expect(slugs(`${PLAN} then ${REPORT} then ${PLAN}`)).toEqual([
			"launch-plan-b7c2d",
			"quarterly-report-a3f9k",
		]);
	});

	test("tolerates a trailing slash on the configured web URL", () => {
		expect(pageLinkFinder(`${WEB_URL}/`)(REPORT)).toEqual([
			{ slug: "quarterly-report-a3f9k", url: REPORT },
		]);
	});

	test("finds nothing when the web URL is not a URL", () => {
		expect(pageLinkFinder("not a url")(REPORT)).toEqual([]);
	});

	test("ignores links that are not a page on the web origin", () => {
		expect(
			slugs(
				[
					"https://evil.example.com/page/quarterly-report-a3f9k",
					`${WEB_URL}/pages`,
					`${WEB_URL}/page/quarterly-report-a3f9k/edit`,
					"/page/quarterly-report-a3f9k",
				].join("\n"),
			),
		).toEqual([]);
	});
});
