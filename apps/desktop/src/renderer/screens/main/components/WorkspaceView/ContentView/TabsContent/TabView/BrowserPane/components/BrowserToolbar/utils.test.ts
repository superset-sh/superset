import { describe, expect, test } from "bun:test";
import { displayUrl, normalizeUrl } from "./utils";

describe("displayUrl", () => {
	test("returns empty string for about:blank", () => {
		expect(displayUrl("about:blank")).toBe("");
	});

	test("strips trailing slash from root URL", () => {
		expect(displayUrl("https://github.com/")).toBe("https://github.com");
	});

	test("strips trailing slash from path", () => {
		expect(displayUrl("https://github.com/foo/bar/")).toBe(
			"https://github.com/foo/bar",
		);
	});

	test("leaves URL unchanged when no trailing slash", () => {
		expect(displayUrl("https://github.com/foo/bar")).toBe(
			"https://github.com/foo/bar",
		);
	});

	test("preserves query string", () => {
		expect(displayUrl("https://example.com/search?q=hello")).toBe(
			"https://example.com/search?q=hello",
		);
	});

	test("preserves fragment", () => {
		expect(displayUrl("https://example.com/page#section")).toBe(
			"https://example.com/page#section",
		);
	});

	test("handles http scheme", () => {
		expect(displayUrl("http://example.com/")).toBe("http://example.com");
	});
});

describe("normalizeUrl", () => {
	test("prepends https:// to bare hostname", () => {
		expect(normalizeUrl("github.com")).toBe("https://github.com");
	});

	test("prepends https:// to hostname with path", () => {
		expect(normalizeUrl("github.com/foo/bar")).toBe(
			"https://github.com/foo/bar",
		);
	});

	test("leaves https:// URLs unchanged", () => {
		expect(normalizeUrl("https://github.com")).toBe("https://github.com");
	});

	test("leaves http:// URLs unchanged", () => {
		expect(normalizeUrl("http://localhost:3000")).toBe(
			"http://localhost:3000",
		);
	});

	test("leaves file:// URLs unchanged", () => {
		expect(normalizeUrl("file:///home/user/index.html")).toBe(
			"file:///home/user/index.html",
		);
	});

	test("leaves about:blank unchanged", () => {
		expect(normalizeUrl("about:blank")).toBe("about:blank");
	});

	test("leaves data: URLs unchanged", () => {
		expect(normalizeUrl("data:text/html,<h1>hi</h1>")).toBe(
			"data:text/html,<h1>hi</h1>",
		);
	});

	test("prepends http:// to bare localhost", () => {
		expect(normalizeUrl("localhost")).toBe("http://localhost");
	});

	test("prepends http:// to localhost with port", () => {
		expect(normalizeUrl("localhost:3000")).toBe("http://localhost:3000");
	});

	test("prepends http:// to localhost with path", () => {
		expect(normalizeUrl("localhost:3000/api/health")).toBe(
			"http://localhost:3000/api/health",
		);
	});

	test("prepends http:// to 127.0.0.1", () => {
		expect(normalizeUrl("127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
	});

	test("prepends http:// to [::1]", () => {
		expect(normalizeUrl("[::1]:4000")).toBe("http://[::1]:4000");
	});

	test("trims whitespace before normalizing", () => {
		expect(normalizeUrl("  github.com  ")).toBe("https://github.com");
	});

	test("returns empty string for blank input", () => {
		expect(normalizeUrl("   ")).toBe("");
	});

	test("handles subdomain", () => {
		expect(normalizeUrl("api.example.com/v1")).toBe(
			"https://api.example.com/v1",
		);
	});
});
