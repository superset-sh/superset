import { describe, expect, it } from "bun:test";
import { externalUrlLogLabel, isSafeExternalUrl } from "./scheme";

describe("isSafeExternalUrl", () => {
	it("allows http, https, and mailto URLs", () => {
		expect(isSafeExternalUrl("http://example.com")).toBe(true);
		expect(isSafeExternalUrl("https://example.com/path?q=1")).toBe(true);
		expect(isSafeExternalUrl("mailto:user@example.com")).toBe(true);
		expect(isSafeExternalUrl("HTTPS://EXAMPLE.COM")).toBe(true);
	});

	it("blocks file, javascript, data, and custom-scheme URLs", () => {
		expect(
			isSafeExternalUrl("file:///System/Applications/Calculator.app"),
		).toBe(false);
		expect(isSafeExternalUrl("file:///etc/passwd")).toBe(false);
		expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
		expect(isSafeExternalUrl("data:text/html,<script>alert(1)</script>")).toBe(
			false,
		);
		expect(isSafeExternalUrl("vscode://open?url=evil")).toBe(false);
		expect(isSafeExternalUrl("ssh://user@host")).toBe(false);
		expect(isSafeExternalUrl("ftp://example.com")).toBe(false);
	});

	it("blocks malformed input", () => {
		expect(isSafeExternalUrl("")).toBe(false);
		expect(isSafeExternalUrl("not a url")).toBe(false);
		expect(isSafeExternalUrl("/etc/passwd")).toBe(false);
	});
});

describe("externalUrlLogLabel", () => {
	it("returns only the scheme, never the full URL", () => {
		expect(externalUrlLogLabel("https://example.com/path?token=secret")).toBe(
			"https:",
		);
		expect(externalUrlLogLabel("file:///etc/passwd")).toBe("file:");
		expect(externalUrlLogLabel("mailto:user@example.com")).toBe("mailto:");
	});

	it("returns sentinels for empty and malformed input", () => {
		expect(externalUrlLogLabel("")).toBe("empty");
		expect(externalUrlLogLabel("not a url")).toBe("malformed");
	});
});
