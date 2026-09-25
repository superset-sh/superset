import { describe, expect, test } from "bun:test";
import { sanitizeUrl } from "./sanitizeUrl";

const SEARCH_PREFIX = "https://www.google.com/search?q=";

describe("sanitizeUrl", () => {
	test("keeps absolute http(s) and about: URLs as typed", () => {
		for (const url of [
			"http://localhost:3000/x?y=1#z",
			"https://user:pw@example.com/",
			"http://[::1]:3000",
			"about:blank",
			// Odd but parseable hosts are the page's problem, not ours.
			"https://{host}/health",
			"https://*.example.com/",
		]) {
			expect(sanitizeUrl(url)).toBe(url);
		}
	});

	test("adds a scheme to hosts typed without one", () => {
		expect(sanitizeUrl("localhost:3000")).toBe("http://localhost:3000");
		expect(sanitizeUrl("127.0.0.1:8080/x")).toBe("http://127.0.0.1:8080/x");
		expect(sanitizeUrl("example.com/path")).toBe("https://example.com/path");
	});

	test("searches text that is not a URL", () => {
		expect(sanitizeUrl("hello world")).toBe(`${SEARCH_PREFIX}hello%20world`);
		expect(sanitizeUrl("")).toBe(SEARCH_PREFIX);
	});

	// A webview's `src` is parsed with `new URL()` inside Electron's
	// connectedCallback, so anything that gains a scheme but still cannot
	// parse would throw from appendChild. These all did.
	test("searches input that a scheme alone cannot make a URL", () => {
		for (const input of [
			"https://",
			"http://",
			"git@github.com:org/repo.git",
			"example.com:abc",
			"localhost:99999",
			"http://foo bar.com",
		]) {
			expect(sanitizeUrl(input)).toBe(
				`${SEARCH_PREFIX}${encodeURIComponent(input)}`,
			);
		}
	});

	test("always returns a parseable absolute URL", () => {
		for (const input of [
			"https://",
			"git@github.com:org/repo.git",
			"localhost:3000",
			"example.com",
			"hello world",
			"",
		]) {
			expect(URL.canParse(sanitizeUrl(input))).toBe(true);
		}
	});
});
