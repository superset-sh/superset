import { describe, expect, it } from "bun:test";
import { classifyExternalUri, isWebUri } from "./external-uri-scheme";

describe("classifyExternalUri", () => {
	it("allows web and mail URLs outright", () => {
		expect(classifyExternalUri("http://example.com")).toBe("allow");
		expect(classifyExternalUri("https://example.com/path?q=1")).toBe("allow");
		expect(classifyExternalUri("HTTPS://EXAMPLE.COM")).toBe("allow");
		expect(classifyExternalUri("mailto:user@example.com")).toBe("allow");
	});

	it("confirms custom app schemes instead of dropping them (#5972)", () => {
		expect(classifyExternalUri("cursor:///Users/me/project")).toBe("confirm");
		expect(
			classifyExternalUri("cursor://file/Users/me/project/AGENTS.md"),
		).toBe("confirm");
		expect(classifyExternalUri("vscode://file/tmp/x")).toBe("confirm");
		expect(classifyExternalUri("slack://channel?id=C123")).toBe("confirm");
		expect(classifyExternalUri("ssh://user@host")).toBe("confirm");
	});

	it("blocks script-executing and local-file schemes", () => {
		expect(classifyExternalUri("javascript:alert(1)")).toBe("block");
		expect(classifyExternalUri("JavaScript:alert(1)")).toBe("block");
		expect(classifyExternalUri("vbscript:msgbox(1)")).toBe("block");
		expect(
			classifyExternalUri("data:text/html,<script>alert(1)</script>"),
		).toBe("block");
		expect(classifyExternalUri("blob:https://example.com/abc")).toBe("block");
		expect(classifyExternalUri("file:///etc/passwd")).toBe("block");
		expect(
			classifyExternalUri("file:///System/Applications/Calculator.app"),
		).toBe("block");
		expect(classifyExternalUri("about:blank")).toBe("block");
		expect(classifyExternalUri("view-source:https://example.com")).toBe(
			"block",
		);
	});

	it("blocks anything that isn't a parseable absolute URI", () => {
		expect(classifyExternalUri("")).toBe("block");
		expect(classifyExternalUri("not a url")).toBe("block");
		expect(classifyExternalUri("/etc/passwd")).toBe("block");
		expect(classifyExternalUri("example.com")).toBe("block");
	});
});

describe("isWebUri", () => {
	it("is true only for http(s)", () => {
		expect(isWebUri("http://example.com")).toBe(true);
		expect(isWebUri("https://example.com")).toBe(true);
		expect(isWebUri("mailto:user@example.com")).toBe(false);
		expect(isWebUri("cursor:///Users/me/project")).toBe(false);
		expect(isWebUri("not a url")).toBe(false);
	});
});
