import { describe, expect, test } from "bun:test";
import { buildUncachedEntry } from "./build-entry";

describe("buildUncachedEntry", () => {
	const ROOT = "/home/user/project";

	test("marks entry as a directory when isDirectory is true", () => {
		// Regression: #2580 — directories were shown as files because the
		// old fallback in getItem always hardcoded isDirectory to false.
		const entry = buildUncachedEntry(`${ROOT}/plugins/ask-data`, ROOT, true);

		expect(entry).toEqual({
			id: `${ROOT}/plugins/ask-data`,
			name: "ask-data",
			path: `${ROOT}/plugins/ask-data`,
			relativePath: "plugins/ask-data",
			isDirectory: true,
		});
	});

	test("marks entry as a file when isDirectory is false", () => {
		const entry = buildUncachedEntry(`${ROOT}/src/index.ts`, ROOT, false);

		expect(entry).toEqual({
			id: `${ROOT}/src/index.ts`,
			name: "index.ts",
			path: `${ROOT}/src/index.ts`,
			relativePath: "src/index.ts",
			isDirectory: false,
		});
	});

	test("derives name from last path segment", () => {
		const entry = buildUncachedEntry(
			`${ROOT}/deeply/nested/folder`,
			ROOT,
			true,
		);
		expect(entry.name).toBe("folder");
	});

	test("computes relative path when item starts with root", () => {
		const entry = buildUncachedEntry(`${ROOT}/plugins/ask-data`, ROOT, true);
		expect(entry.relativePath).toBe("plugins/ask-data");
	});

	test("uses full itemId as relativePath when rootPath is undefined", () => {
		const entry = buildUncachedEntry("/some/abs/path", undefined, false);
		expect(entry.relativePath).toBe("/some/abs/path");
	});

	test("handles Windows-style paths", () => {
		const entry = buildUncachedEntry(
			"C:\\Users\\dev\\project\\plugins\\ask-data",
			"C:\\Users\\dev\\project",
			true,
		);

		expect(entry.name).toBe("ask-data");
		expect(entry.isDirectory).toBe(true);
		expect(entry.relativePath).toBe("plugins\\ask-data");
	});
});
