import { describe, expect, test } from "bun:test";
import type { FileSystemChangeEvent } from "shared/file-tree-types";
import { eventTargetsFile } from "./event-targets-file";

function makeEvent(
	overrides: Partial<FileSystemChangeEvent> = {},
): FileSystemChangeEvent {
	return {
		type: "update",
		revision: 0,
		...overrides,
	};
}

describe("eventTargetsFile", () => {
	test("returns false when absolutePath is null", () => {
		const event = makeEvent({ absolutePath: "/workspace/src/file.ts" });
		expect(eventTargetsFile(event, null)).toBe(false);
	});

	test("returns true for overflow events regardless of path", () => {
		const event = makeEvent({ type: "overflow" });
		expect(eventTargetsFile(event, "/workspace/src/file.ts")).toBe(true);
	});

	test("returns true when event path matches exactly", () => {
		const event = makeEvent({ absolutePath: "/workspace/src/file.ts" });
		expect(eventTargetsFile(event, "/workspace/src/file.ts")).toBe(true);
	});

	test("returns false when event path does not match", () => {
		const event = makeEvent({ absolutePath: "/workspace/src/other.ts" });
		expect(eventTargetsFile(event, "/workspace/src/file.ts")).toBe(false);
	});

	test("returns false when event has no absolutePath", () => {
		const event = makeEvent({ absolutePath: undefined });
		expect(eventTargetsFile(event, "/workspace/src/file.ts")).toBe(false);
	});

	// Regression: the old implementation used === instead of pathsMatch,
	// which meant paths that differ only in trailing slashes or separator
	// style would fail to match, causing diff views not to refresh.
	test("matches paths that differ only by trailing slash", () => {
		const event = makeEvent({ absolutePath: "/workspace/src/" });
		expect(eventTargetsFile(event, "/workspace/src")).toBe(true);
	});

	test("matches paths with mixed separators (Windows-style)", () => {
		const event = makeEvent({
			absolutePath: "C:\\Users\\dev\\project\\file.ts",
		});
		expect(eventTargetsFile(event, "C:/Users/dev/project/file.ts")).toBe(true);
	});

	test("matches paths with double separators", () => {
		const event = makeEvent({
			absolutePath: "/workspace//src/file.ts",
		});
		expect(eventTargetsFile(event, "/workspace/src/file.ts")).toBe(true);
	});

	test("handles rename events targeting the file", () => {
		const event = makeEvent({
			type: "rename",
			absolutePath: "/workspace/src/renamed.ts",
			oldAbsolutePath: "/workspace/src/file.ts",
		});
		expect(eventTargetsFile(event, "/workspace/src/file.ts")).toBe(true);
	});

	test("handles rename events not targeting the file", () => {
		const event = makeEvent({
			type: "rename",
			absolutePath: "/workspace/src/renamed.ts",
			oldAbsolutePath: "/workspace/src/other.ts",
		});
		expect(eventTargetsFile(event, "/workspace/src/file.ts")).toBe(false);
	});

	test("handles rename events with missing paths", () => {
		const event = makeEvent({
			type: "rename",
			absolutePath: undefined,
			oldAbsolutePath: undefined,
		});
		expect(eventTargetsFile(event, "/workspace/src/file.ts")).toBe(false);
	});
});
