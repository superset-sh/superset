import { describe, expect, it } from "bun:test";
import { extractWorkspaceIdFromUrl } from "./utils";

describe("extractWorkspaceIdFromUrl", () => {
	it("extracts workspace ID from hash-routed URL", () => {
		const url = "file:///app/index.html#/workspace/abc123";
		expect(extractWorkspaceIdFromUrl(url)).toBe("abc123");
	});

	it("extracts workspace ID when file path contains /workspace/", () => {
		// This is the key case - file path has /workspace/ but we should extract from hash
		const url =
			"file:///Users/foo/workspace/superset/dist/index.html#/workspace/def456";
		expect(extractWorkspaceIdFromUrl(url)).toBe("def456");
	});

	it("handles query params in hash", () => {
		const url = "file:///app/index.html#/workspace/ghi789?foo=bar";
		expect(extractWorkspaceIdFromUrl(url)).toBe("ghi789");
	});

	it("handles nested hash fragments", () => {
		const url = "file:///app/index.html#/workspace/jkl012#section";
		expect(extractWorkspaceIdFromUrl(url)).toBe("jkl012");
	});

	it("handles UUIDs as workspace IDs", () => {
		const url =
			"file:///app/index.html#/workspace/550e8400-e29b-41d4-a716-446655440000";
		expect(extractWorkspaceIdFromUrl(url)).toBe(
			"550e8400-e29b-41d4-a716-446655440000",
		);
	});

	it("returns null when no workspace in hash", () => {
		const url = "file:///app/index.html#/settings/account";
		expect(extractWorkspaceIdFromUrl(url)).toBeNull();
	});

	it("returns null when URL has no hash", () => {
		const url = "file:///app/index.html";
		expect(extractWorkspaceIdFromUrl(url)).toBeNull();
	});

	it("returns null for invalid URL", () => {
		expect(extractWorkspaceIdFromUrl("not-a-valid-url")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(extractWorkspaceIdFromUrl("")).toBeNull();
	});

	it("handles http URLs with hash routing", () => {
		const url = "http://localhost:5173/#/workspace/mno345";
		expect(extractWorkspaceIdFromUrl(url)).toBe("mno345");
	});
});
