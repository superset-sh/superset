import { describe, expect, test } from "bun:test";
import type { FileSystemChangeEvent } from "shared/file-tree-types";
import { collectEventPaths } from "./collect-event-paths";

function makeEvent(
	overrides: Partial<FileSystemChangeEvent> = {},
): FileSystemChangeEvent {
	return { type: "update", revision: 0, ...overrides };
}

describe("collectEventPaths", () => {
	test("returns isOverflow for overflow events without paths", () => {
		const result = collectEventPaths(makeEvent({ type: "overflow" }));
		expect(result.isOverflow).toBe(true);
		expect(result.paths).toEqual([]);
	});

	test("returns the absolute path for an update event", () => {
		const result = collectEventPaths(
			makeEvent({ type: "update", absolutePath: "/ws/src/file.ts" }),
		);
		expect(result.isOverflow).toBe(false);
		expect(result.paths).toEqual(["/ws/src/file.ts"]);
	});

	test("returns both old and new paths for rename events", () => {
		const result = collectEventPaths(
			makeEvent({
				type: "rename",
				absolutePath: "/ws/src/new.ts",
				oldAbsolutePath: "/ws/src/old.ts",
			}),
		);
		expect(result.isOverflow).toBe(false);
		expect(result.paths.sort()).toEqual(
			["/ws/src/new.ts", "/ws/src/old.ts"].sort(),
		);
	});

	test("does not duplicate when rename event reports the same old and new path", () => {
		const result = collectEventPaths(
			makeEvent({
				type: "rename",
				absolutePath: "/ws/src/file.ts",
				oldAbsolutePath: "/ws/src/file.ts",
			}),
		);
		expect(result.paths).toEqual(["/ws/src/file.ts"]);
	});

	test("returns empty paths when create/update event has no absolutePath", () => {
		const result = collectEventPaths(
			makeEvent({ type: "update", absolutePath: undefined }),
		);
		expect(result.isOverflow).toBe(false);
		expect(result.paths).toEqual([]);
	});

	test("returns the old path even if the new path is missing", () => {
		const result = collectEventPaths(
			makeEvent({
				type: "rename",
				absolutePath: undefined,
				oldAbsolutePath: "/ws/src/old.ts",
			}),
		);
		expect(result.paths).toEqual(["/ws/src/old.ts"]);
	});

	test("supports delete events", () => {
		const result = collectEventPaths(
			makeEvent({ type: "delete", absolutePath: "/ws/src/gone.ts" }),
		);
		expect(result.isOverflow).toBe(false);
		expect(result.paths).toEqual(["/ws/src/gone.ts"]);
	});

	test("supports create events", () => {
		const result = collectEventPaths(
			makeEvent({ type: "create", absolutePath: "/ws/src/new.ts" }),
		);
		expect(result.isOverflow).toBe(false);
		expect(result.paths).toEqual(["/ws/src/new.ts"]);
	});
});
