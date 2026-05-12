import { describe, expect, test } from "bun:test";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import {
	buildChangesRows,
	type GroupKey,
	groupChangesetFiles,
} from "./buildChangesRows";

function makeFile(
	path: string,
	kind: ChangesetFile["source"]["kind"],
): ChangesetFile {
	const source: ChangesetFile["source"] =
		kind === "against-base"
			? { kind: "against-base", baseBranch: "main" }
			: kind === "commit"
				? { kind: "commit", commitHash: "abc123" }
				: { kind };
	return {
		path,
		status: "modified",
		additions: 1,
		deletions: 0,
		source,
	};
}

const allOpen: Record<GroupKey, boolean> = {
	unstaged: true,
	staged: true,
	"against-base": true,
	commit: true,
};

const allClosed: Record<GroupKey, boolean> = {
	unstaged: false,
	staged: false,
	"against-base": false,
	commit: false,
};

describe("groupChangesetFiles", () => {
	test("buckets files by source kind", () => {
		const files: ChangesetFile[] = [
			makeFile("a.ts", "unstaged"),
			makeFile("b.ts", "unstaged"),
			makeFile("c.ts", "staged"),
			makeFile("d.ts", "against-base"),
			makeFile("e.ts", "commit"),
		];
		const groups = groupChangesetFiles(files);
		expect(groups.unstaged).toHaveLength(2);
		expect(groups.staged).toHaveLength(1);
		expect(groups["against-base"]).toHaveLength(1);
		expect(groups.commit).toHaveLength(1);
	});

	test("returns empty arrays for unused kinds", () => {
		const groups = groupChangesetFiles([makeFile("a.ts", "unstaged")]);
		expect(groups.staged).toEqual([]);
		expect(groups["against-base"]).toEqual([]);
		expect(groups.commit).toEqual([]);
	});
});

describe("buildChangesRows", () => {
	test("returns empty when no files", () => {
		const groups = groupChangesetFiles([]);
		expect(buildChangesRows(groups, allOpen)).toEqual([]);
	});

	test("emits a header followed by file rows for each non-empty open group", () => {
		const files: ChangesetFile[] = [
			makeFile("a.ts", "unstaged"),
			makeFile("b.ts", "unstaged"),
			makeFile("c.ts", "staged"),
		];
		const rows = buildChangesRows(groupChangesetFiles(files), allOpen);
		expect(rows.map((r) => `${r.kind}:${r.groupKey}`)).toEqual([
			"header:unstaged",
			"file:unstaged",
			"file:unstaged",
			"header:staged",
			"file:staged",
		]);
	});

	test("skips groups with no files", () => {
		const files: ChangesetFile[] = [makeFile("only-commit.ts", "commit")];
		const rows = buildChangesRows(groupChangesetFiles(files), allOpen);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ kind: "header", groupKey: "commit" });
		expect(rows[1]).toMatchObject({ kind: "file", groupKey: "commit" });
	});

	test("preserves canonical group order regardless of file order", () => {
		const files: ChangesetFile[] = [
			makeFile("a.ts", "commit"),
			makeFile("b.ts", "against-base"),
			makeFile("c.ts", "staged"),
			makeFile("d.ts", "unstaged"),
		];
		const rows = buildChangesRows(groupChangesetFiles(files), allOpen);
		const groupKeys = rows
			.filter((r) => r.kind === "header")
			.map((r) => r.groupKey);
		expect(groupKeys).toEqual(["unstaged", "staged", "against-base", "commit"]);
	});

	test("collapsed group emits header but no file rows", () => {
		const files: ChangesetFile[] = [
			makeFile("a.ts", "unstaged"),
			makeFile("b.ts", "unstaged"),
			makeFile("c.ts", "staged"),
		];
		const rows = buildChangesRows(groupChangesetFiles(files), {
			...allOpen,
			unstaged: false,
		});
		expect(rows.filter((r) => r.kind === "file")).toHaveLength(1);
		expect(
			rows.find((r) => r.kind === "header" && r.groupKey === "unstaged"),
		).toBeDefined();
		const unstagedHeader = rows.find(
			(r) => r.kind === "header" && r.groupKey === "unstaged",
		);
		expect(unstagedHeader?.kind === "header" && unstagedHeader.open).toBe(
			false,
		);
	});

	test("scales linearly: 4 sections of 500 files = 4 headers + 2000 files", () => {
		const files: ChangesetFile[] = [];
		for (let i = 0; i < 500; i++) files.push(makeFile(`u/${i}.ts`, "unstaged"));
		for (let i = 0; i < 500; i++) files.push(makeFile(`s/${i}.ts`, "staged"));
		for (let i = 0; i < 500; i++)
			files.push(makeFile(`b/${i}.ts`, "against-base"));
		for (let i = 0; i < 500; i++) files.push(makeFile(`c/${i}.ts`, "commit"));
		const rows = buildChangesRows(groupChangesetFiles(files), allOpen);
		expect(rows.filter((r) => r.kind === "header")).toHaveLength(4);
		expect(rows.filter((r) => r.kind === "file")).toHaveLength(2000);
	});

	test("collapsing all groups leaves only headers (DOM stays small)", () => {
		const files: ChangesetFile[] = [];
		for (let i = 0; i < 500; i++) files.push(makeFile(`u/${i}.ts`, "unstaged"));
		for (let i = 0; i < 500; i++) files.push(makeFile(`s/${i}.ts`, "staged"));
		const rows = buildChangesRows(groupChangesetFiles(files), allClosed);
		expect(rows).toHaveLength(2);
		expect(rows.every((r) => r.kind === "header")).toBe(true);
	});

	test("file rows carry their group key for context-aware rendering", () => {
		const files: ChangesetFile[] = [
			makeFile("a.ts", "unstaged"),
			makeFile("b.ts", "staged"),
		];
		const rows = buildChangesRows(groupChangesetFiles(files), allOpen);
		const fileRows = rows.filter((r) => r.kind === "file");
		expect(fileRows[0]?.groupKey).toBe("unstaged");
		expect(fileRows[1]?.groupKey).toBe("staged");
	});

	test("row keys are unique across groups even for identical paths", () => {
		const files: ChangesetFile[] = [
			makeFile("same/path.ts", "unstaged"),
			makeFile("same/path.ts", "staged"),
		];
		const rows = buildChangesRows(groupChangesetFiles(files), allOpen);
		const keys = rows.map((r) => r.key);
		expect(new Set(keys).size).toBe(keys.length);
	});
});
