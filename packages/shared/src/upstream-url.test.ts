import { describe, expect, test } from "bun:test";
import { isOriginFormTarget, resolveUpstreamUrl } from "./upstream-url";

const ORIGIN = "http://127.0.0.1:38017";

describe("resolveUpstreamUrl", () => {
	test("keeps an ordinary path, its query and its escaping", () => {
		expect(resolveUpstreamUrl(ORIGIN, "/trpc/health.check")?.href).toBe(
			`${ORIGIN}/trpc/health.check`,
		);
		expect(resolveUpstreamUrl(ORIGIN, "/a?b=c&d=e%20f")?.href).toBe(
			`${ORIGIN}/a?b=c&d=e%20f`,
		);
		expect(resolveUpstreamUrl(ORIGIN, "/")?.href).toBe(`${ORIGIN}/`);
		expect(resolveUpstreamUrl("https://sb-abc.vercel.run", "/x")?.href).toBe(
			"https://sb-abc.vercel.run/x",
		);
	});

	test("a path may not move the origin", () => {
		for (const target of [
			"//evil.example/x",
			"/\\evil.example/x",
			"\\\\evil.example/x",
			"http://evil.example/x",
			"https://evil.example",
			"//evil.example",
		]) {
			expect(resolveUpstreamUrl(ORIGIN, target)).toBeNull();
		}
	});

	// The URL parser strips these before resolving, so a check that only looked
	// at the literal prefix would pass them through as protocol-relative.
	test("a path may not smuggle a control character past the prefix check", () => {
		for (const target of [
			"/\t/evil.example/x",
			"/\n/evil.example/x",
			"/\r/evil.example/x",
			"/\u007f/evil.example/x",
			"/ /x",
			"/a b",
			"/a\u0000",
		]) {
			expect(resolveUpstreamUrl(ORIGIN, target)).toBeNull();
		}
	});

	// Concatenated onto an origin string, a leading `@` turns the origin into
	// userinfo and the rest into the host.
	test("a path that is not origin-form is refused rather than reinterpreted", () => {
		for (const target of [
			"@evil.example/x",
			":pw@evil.example/x",
			"",
			"x",
			"?q=1",
		]) {
			expect(resolveUpstreamUrl(ORIGIN, target)).toBeNull();
		}
	});

	test("traversal resolves rather than escaping, since it cannot leave the origin", () => {
		expect(resolveUpstreamUrl(ORIGIN, "/a/../../x")?.href).toBe(`${ORIGIN}/x`);
	});

	test("an origin that is not a URL yields nothing to send to", () => {
		expect(resolveUpstreamUrl("not a url", "/x")).toBeNull();
		expect(resolveUpstreamUrl("", "/x")).toBeNull();
	});
});

describe("isOriginFormTarget", () => {
	test("accepts what a hop may forward on unchanged", () => {
		expect(isOriginFormTarget("/trpc/health.check")).toBe(true);
		expect(isOriginFormTarget("/")).toBe(true);
		expect(isOriginFormTarget("/a?b=c")).toBe(true);
		expect(isOriginFormTarget("/a/@b")).toBe(true);
	});

	test("rejects anything that could name a host of its own", () => {
		expect(isOriginFormTarget("//evil.example")).toBe(false);
		expect(isOriginFormTarget("/\\evil.example")).toBe(false);
		expect(isOriginFormTarget("/\t/evil.example")).toBe(false);
		expect(isOriginFormTarget("@evil.example")).toBe(false);
		expect(isOriginFormTarget("http://evil.example")).toBe(false);
		expect(isOriginFormTarget("")).toBe(false);
	});
});
