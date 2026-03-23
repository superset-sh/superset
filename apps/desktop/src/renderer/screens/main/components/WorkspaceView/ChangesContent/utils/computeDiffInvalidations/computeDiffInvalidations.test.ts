import { describe, expect, test } from "bun:test";
import type { FileSystemChangeEvent } from "shared/file-tree-types";
import { computeDiffInvalidations } from "./computeDiffInvalidations";

describe("computeDiffInvalidations", () => {
	test("returns 'all' for overflow events", () => {
		const event: FileSystemChangeEvent = {
			type: "overflow",
			revision: 1,
		};

		expect(computeDiffInvalidations(event)).toBe("all");
	});

	test("returns the absolute path for a create event", () => {
		const event: FileSystemChangeEvent = {
			type: "create",
			absolutePath: "/workspace/src/foo.ts",
			relativePath: "src/foo.ts",
			revision: 1,
		};

		expect(computeDiffInvalidations(event)).toEqual(["/workspace/src/foo.ts"]);
	});

	test("returns the absolute path for an update event", () => {
		const event: FileSystemChangeEvent = {
			type: "update",
			absolutePath: "/workspace/src/bar.ts",
			relativePath: "src/bar.ts",
			revision: 2,
		};

		expect(computeDiffInvalidations(event)).toEqual(["/workspace/src/bar.ts"]);
	});

	test("returns the absolute path for a delete event", () => {
		const event: FileSystemChangeEvent = {
			type: "delete",
			absolutePath: "/workspace/src/removed.ts",
			relativePath: "src/removed.ts",
			revision: 3,
		};

		expect(computeDiffInvalidations(event)).toEqual([
			"/workspace/src/removed.ts",
		]);
	});

	test("returns both old and new paths for rename events", () => {
		const event: FileSystemChangeEvent = {
			type: "rename",
			absolutePath: "/workspace/src/new-name.ts",
			oldAbsolutePath: "/workspace/src/old-name.ts",
			relativePath: "src/new-name.ts",
			oldRelativePath: "src/old-name.ts",
			revision: 4,
		};

		const result = computeDiffInvalidations(event);
		expect(result).toEqual([
			"/workspace/src/new-name.ts",
			"/workspace/src/old-name.ts",
		]);
	});

	test("returns only new path for rename without oldAbsolutePath", () => {
		const event: FileSystemChangeEvent = {
			type: "rename",
			absolutePath: "/workspace/src/new-name.ts",
			relativePath: "src/new-name.ts",
			revision: 5,
		};

		expect(computeDiffInvalidations(event)).toEqual([
			"/workspace/src/new-name.ts",
		]);
	});

	test("returns empty array when event has no absolutePath", () => {
		const event: FileSystemChangeEvent = {
			type: "update",
			revision: 6,
		};

		expect(computeDiffInvalidations(event)).toEqual([]);
	});
});
