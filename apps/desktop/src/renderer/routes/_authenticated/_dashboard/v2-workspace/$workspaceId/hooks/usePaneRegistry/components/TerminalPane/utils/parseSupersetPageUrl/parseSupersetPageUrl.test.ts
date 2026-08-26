import { describe, expect, it } from "bun:test";
import { parseSupersetPageUrl } from "./parseSupersetPageUrl";

const WEB_URL = "https://app.superset.sh";

describe("parseSupersetPageUrl", () => {
	it("extracts the slug from a page URL on the web origin", () => {
		expect(
			parseSupersetPageUrl(`${WEB_URL}/page/quarterly-report-a3f9k2`, WEB_URL),
		).toBe("quarterly-report-a3f9k2");
	});

	it("tolerates a trailing slash", () => {
		expect(
			parseSupersetPageUrl(`${WEB_URL}/page/report-a3f9k2/`, WEB_URL),
		).toBe("report-a3f9k2");
	});

	it("ignores query strings and hashes", () => {
		expect(
			parseSupersetPageUrl(`${WEB_URL}/page/report-a3f9k2?v=2#top`, WEB_URL),
		).toBe("report-a3f9k2");
	});

	it("tolerates a trailing slash on the configured web URL", () => {
		expect(
			parseSupersetPageUrl(`${WEB_URL}/page/report-a3f9k2`, `${WEB_URL}/`),
		).toBe("report-a3f9k2");
	});

	it("rejects a different origin", () => {
		expect(
			parseSupersetPageUrl(
				"https://evil.example.com/page/report-a3f9k2",
				WEB_URL,
			),
		).toBeNull();
	});

	it("rejects a different scheme on the same host", () => {
		expect(
			parseSupersetPageUrl(
				"http://app.superset.sh/page/report-a3f9k2",
				WEB_URL,
			),
		).toBeNull();
	});

	it("rejects non-page paths", () => {
		expect(parseSupersetPageUrl(`${WEB_URL}/pages/report`, WEB_URL)).toBeNull();
		expect(parseSupersetPageUrl(`${WEB_URL}/tasks/report`, WEB_URL)).toBeNull();
		expect(parseSupersetPageUrl(WEB_URL, WEB_URL)).toBeNull();
	});

	it("rejects a page path with no slug", () => {
		expect(parseSupersetPageUrl(`${WEB_URL}/page`, WEB_URL)).toBeNull();
		expect(parseSupersetPageUrl(`${WEB_URL}/page/`, WEB_URL)).toBeNull();
	});

	it("rejects nested paths under a page", () => {
		expect(
			parseSupersetPageUrl(`${WEB_URL}/page/report-a3f9k2/edit`, WEB_URL),
		).toBeNull();
	});

	it("decodes percent-encoded slugs", () => {
		expect(parseSupersetPageUrl(`${WEB_URL}/page/a%20b-a3f9k2`, WEB_URL)).toBe(
			"a b-a3f9k2",
		);
	});

	it("returns null for text that is not a URL", () => {
		expect(parseSupersetPageUrl("not a url", WEB_URL)).toBeNull();
		expect(parseSupersetPageUrl("", WEB_URL)).toBeNull();
	});
});
