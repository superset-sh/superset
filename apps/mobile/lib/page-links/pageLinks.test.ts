import { describe, expect, test } from "bun:test";
import { pageSlugFromUrl } from "./pageLinks";

const WEB = "https://app.superset.sh";

describe("pageSlugFromUrl", () => {
	test("reads the slug from a page link", () => {
		expect(pageSlugFromUrl(`${WEB}/page/one-plugin-surface-q7x`, WEB)).toBe(
			"one-plugin-surface-q7x",
		);
	});

	test("ignores a trailing slash, query and fragment", () => {
		expect(pageSlugFromUrl(`${WEB}/page/deploy-notes/`, WEB)).toBe(
			"deploy-notes",
		);
		expect(pageSlugFromUrl(`${WEB}/page/deploy-notes?v=3#top`, WEB)).toBe(
			"deploy-notes",
		);
	});

	test("tolerates a configured web url with a trailing slash", () => {
		expect(pageSlugFromUrl(`${WEB}/page/deploy-notes`, `${WEB}/`)).toBe(
			"deploy-notes",
		);
	});

	test("refuses another origin, however similar", () => {
		expect(pageSlugFromUrl("https://superset.sh/page/deploy-notes", WEB)).toBe(
			null,
		);
		expect(
			pageSlugFromUrl("https://app.superset.sh.evil.example/page/x", WEB),
		).toBe(null);
		expect(pageSlugFromUrl(`http://app.superset.sh/page/x`, WEB)).toBe(null);
	});

	test("refuses paths that are not a single page", () => {
		expect(pageSlugFromUrl(`${WEB}/pages/deploy-notes`, WEB)).toBe(null);
		expect(pageSlugFromUrl(`${WEB}/page`, WEB)).toBe(null);
		expect(pageSlugFromUrl(`${WEB}/page/`, WEB)).toBe(null);
		expect(pageSlugFromUrl(`${WEB}/page/deploy-notes/versions`, WEB)).toBe(
			null,
		);
	});

	test("refuses anything that is not a url", () => {
		expect(pageSlugFromUrl("not a url", WEB)).toBe(null);
		expect(pageSlugFromUrl("", WEB)).toBe(null);
	});
});
