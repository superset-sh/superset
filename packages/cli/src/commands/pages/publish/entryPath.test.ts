import { describe, expect, test } from "bun:test";
import { resolveEntryPath } from "./entryPath";

const workspacePath = "/Users/dev/ws";

describe("resolveEntryPath", () => {
	test("re-bases a path on the workspace root", () => {
		expect(
			resolveEntryPath({
				filePath: "./dist/index.html",
				workspacePath,
				cwd: "/Users/dev/ws/apps/marketing",
			}),
		).toBe("apps/marketing/dist/index.html");
	});

	test("resolves the same file to one key from two directories", () => {
		// The ambiguity of a bare "./index.html" is removed before storage, which
		// is the whole reason the key is canonicalised rather than taken verbatim.
		const fromRoot = resolveEntryPath({
			filePath: "./dist/index.html",
			workspacePath,
			cwd: workspacePath,
		});
		const fromInside = resolveEntryPath({
			filePath: "./index.html",
			workspacePath,
			cwd: "/Users/dev/ws/dist",
		});
		expect(fromRoot).toBe("dist/index.html");
		expect(fromInside).toBe(fromRoot);
	});

	test("accepts an absolute path inside the workspace", () => {
		expect(
			resolveEntryPath({
				filePath: "/Users/dev/ws/index.html",
				workspacePath,
				cwd: "/somewhere/else",
			}),
		).toBe("index.html");
	});

	test("returns null for a file outside the workspace", () => {
		// Publishing it unlinked is honest; a workspace-scoped key would lie.
		expect(
			resolveEntryPath({
				filePath: "../other/index.html",
				workspacePath,
				cwd: workspacePath,
			}),
		).toBeNull();
	});

	test("returns null when there is no workspace", () => {
		expect(
			resolveEntryPath({
				filePath: "./index.html",
				workspacePath: undefined,
				cwd: "/tmp",
			}),
		).toBeNull();
	});

	test("returns null when the file is the workspace root itself", () => {
		expect(
			resolveEntryPath({ filePath: workspacePath, workspacePath, cwd: "/" }),
		).toBeNull();
	});
});
