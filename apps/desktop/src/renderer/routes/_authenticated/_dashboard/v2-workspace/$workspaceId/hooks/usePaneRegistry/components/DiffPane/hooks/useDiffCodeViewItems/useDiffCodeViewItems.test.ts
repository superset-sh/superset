import { describe, expect, test } from "bun:test";
import type { ChangesetFile } from "../../../../../useChangeset";
import {
	buildPatchGroups,
	groupKeyFor,
	usablePatchData,
} from "./useDiffCodeViewItems";

function file(
	path: string,
	status: ChangesetFile["status"] = "modified",
): ChangesetFile {
	return {
		path,
		status,
		additions: 1,
		deletions: 0,
		isBinary: false,
		source: { kind: "unstaged" },
	};
}
function group(workspaceId: string, files: ChangesetFile[]) {
	const result = buildPatchGroups(workspaceId, files, new Set())[0];
	if (!result) throw new Error("expected a patch group");
	return result;
}

describe("diff patch cache keys", () => {
	test("changes when a built group's requested paths change", () => {
		expect(group("workspace-1", [file("src/first.ts")]).key).not.toBe(
			group("workspace-1", [file("src/second.ts")]).key,
		);
	});
	test("separates tracked and untracked paths without delimiter collisions", () => {
		expect(
			groupKeyFor({
				workspaceId: "w",
				category: "unstaged",
				paths: ["a", "b"],
			}),
		).not.toBe(
			groupKeyFor({
				workspaceId: "w",
				category: "unstaged",
				paths: ["a\u0000b"],
			}),
		);
		expect(group("workspace-1", [file("same")]).key).not.toBe(
			group("workspace-1", [file("same", "untracked")]).key,
		);
	});
	test("includes the workspace", () => {
		expect(group("workspace-1", [file("src/file.ts")]).key).not.toBe(
			group("workspace-2", [file("src/file.ts")]).key,
		);
	});
	test("canonicalizes the actual request input and cache key", () => {
		const first = group("workspace-1", [file("b.ts"), file("a.ts")]);
		const second = group("workspace-1", [file("a.ts"), file("b.ts")]);
		expect(first.input.paths).toEqual(["a.ts", "b.ts"]);
		expect(first.input).toEqual(second.input);
		expect(first.key).toBe(second.key);
	});
});

describe("usablePatchData", () => {
	test("does not expose retained data after a replacement request errors", () => {
		const stale = { kind: "patch" as const, patch: "old hunks" };
		expect(usablePatchData({ data: stale, isError: true })).toBeUndefined();
		expect(usablePatchData({ data: stale, isError: false })).toBe(stale);
	});
});
