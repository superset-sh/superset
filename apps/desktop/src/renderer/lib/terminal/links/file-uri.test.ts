import { describe, expect, it } from "bun:test";
import { fileUriToPath } from "./file-uri";

describe("fileUriToPath", () => {
	it("returns the path for a local file URI", () => {
		expect(
			fileUriToPath("file:///Users/me/.claude/image-cache/abc/22.png"),
		).toBe("/Users/me/.claude/image-cache/abc/22.png");
	});

	it("decodes percent-escaped characters", () => {
		expect(fileUriToPath("file:///tmp/my%20shot%20(1).png")).toBe(
			"/tmp/my shot (1).png",
		);
	});

	it("accepts an explicit localhost host", () => {
		expect(fileUriToPath("file://localhost/tmp/a.png")).toBe("/tmp/a.png");
	});

	it("rejects a UNC path rather than dropping the host", () => {
		expect(fileUriToPath("file://server/share/a.png")).toBeNull();
	});

	it("rejects other schemes so they stay on the URL path", () => {
		expect(fileUriToPath("https://example.com/a.png")).toBeNull();
		expect(fileUriToPath("javascript:alert(1)")).toBeNull();
		expect(fileUriToPath("not a uri")).toBeNull();
	});
});
