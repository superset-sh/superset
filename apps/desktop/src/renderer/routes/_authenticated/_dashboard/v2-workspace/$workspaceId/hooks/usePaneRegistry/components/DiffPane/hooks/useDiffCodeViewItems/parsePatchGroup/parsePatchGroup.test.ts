import { describe, expect, test } from "bun:test";
import {
	buildPatchSegmentKey,
	parsePatchGroup,
	splitPatchSegments,
} from "./parsePatchGroup";

const FILE_A = [
	"diff --git a/a.ts b/a.ts",
	"index 0000001..0000002 100644",
	"--- a/a.ts",
	"+++ b/a.ts",
	"@@ -1,2 +1,2 @@",
	" const shared = 1;",
	"-const a = 1;",
	"+const a = 2;",
	"",
].join("\n");

const FILE_B = [
	"diff --git a/b.ts b/b.ts",
	"index 0000003..0000004 100644",
	"--- a/b.ts",
	"+++ b/b.ts",
	"@@ -1,1 +1,2 @@",
	" const b = 1;",
	"+const added = 2;",
	"",
].join("\n");

const FILE_B_EDITED = FILE_B.replace("+const added = 2;", "+const added = 3;");

describe("splitPatchSegments", () => {
	test("cuts at every file header and keeps leading text on the first", () => {
		const segments = splitPatchSegments(`commit message\n${FILE_A}${FILE_B}`);
		expect(segments).toEqual([`commit message\n${FILE_A}`, FILE_B]);
		expect(splitPatchSegments("")).toEqual([]);
	});
});

describe("parsePatchGroup", () => {
	test("an unchanged section keeps its parsed object and key when a sibling changes", () => {
		const before = parsePatchGroup("group", {
			kind: "patch",
			patch: FILE_A + FILE_B,
			requestedPaths: ["a.ts", "b.ts"],
			requestedUntrackedPaths: [],
		});
		const after = parsePatchGroup(
			"group",
			{
				kind: "patch",
				patch: FILE_A + FILE_B_EDITED,
				requestedPaths: ["a.ts", "b.ts"],
				requestedUntrackedPaths: [],
			},
			before,
		);

		expect(after.byPath.get("a.ts")).toBe(before.byPath.get("a.ts"));
		expect(after.byPath.get("a.ts")?.cacheKey).toBe(
			`${buildPatchSegmentKey("group", FILE_A)}-0-0`,
		);
		expect(after.byPath.get("b.ts")).not.toBe(before.byPath.get("b.ts"));
		expect(after.byPath.get("b.ts")?.cacheKey).not.toBe(
			before.byPath.get("b.ts")?.cacheKey,
		);
		expect(after.bySegmentKey.size).toBe(2);
	});

	test("the same section in two groups gets two keys", () => {
		expect(buildPatchSegmentKey("staged", FILE_A)).not.toBe(
			buildPatchSegmentKey("unstaged", FILE_A),
		);
	});
});
