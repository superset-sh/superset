import { expect, test } from "bun:test";
import { parsePatchFiles } from "@pierre/diffs";
import { fetchPullRequestFilesDiff } from "@superset/shared/pull-request-diff";
import { parsePullRequestPatch } from "./parsePullRequestPatch";

test.each([
	"name.txt",
	" spaces .txt ",
	String.raw`back\slash.txt`,
	'quote".txt',
	"tab\tname.txt",
	"line\nname.txt",
	"日本語.txt",
])("restores exact API paths and statuses: %j", async (filename) => {
	const entries = [
		{
			filename,
			status: "added",
			additions: 1,
			deletions: 0,
			patch: "@@ -0,0 +1 @@\n+new",
		},
		{
			filename: `removed-${filename}`,
			status: "removed",
			additions: 0,
			deletions: 1,
			patch: "@@ -1 +0,0 @@\n-old",
		},
		{
			filename: `renamed-${filename}`,
			previous_filename: `old-${filename}`,
			status: "renamed",
			additions: 1,
			deletions: 1,
			patch: "@@ -1 +1 @@\n-old\n+new",
		},
		{
			filename: `pure-${filename}`,
			previous_filename: `original-${filename}`,
			status: "renamed",
			additions: 0,
			deletions: 0,
		},
	];
	const metadata = {
		base: { sha: "a".repeat(40) },
		head: { sha: "b".repeat(40) },
		changed_files: 4,
		additions: 2,
		deletions: 2,
	};
	const diff = await fetchPullRequestFilesDiff({
		readPullRequest: async () => metadata,
		readFiles: async () => entries,
	});
	const parsed = parsePullRequestPatch(diff);
	expect(parsed.map((file) => file.name)).toEqual(
		entries.map((file) => file.filename),
	);
	expect(parsed.map((file) => file.type)).toEqual([
		"new",
		"deleted",
		"rename-changed",
		"rename-pure",
	]);
	expect(parsed.map((file) => file.prevName)).toEqual([
		undefined,
		undefined,
		`old-${filename}`,
		`original-${filename}`,
	]);
	expect(
		parsed.reduce(
			(sum, file) =>
				sum + file.hunks.reduce((n, hunk) => n + hunk.additionLines, 0),
			0,
		),
	).toBe(2);
	expect(
		parsed.reduce(
			(sum, file) =>
				sum + file.hunks.reduce((n, hunk) => n + hunk.deletionLines, 0),
			0,
		),
	).toBe(2);
});

test("preserves the existing parser result without API metadata", () => {
	const patch =
		"diff --git a/test b/test\n--- a/test\n+++ b/test\n@@ -1 +1 @@\n-old\n+new\n";
	expect(parsePullRequestPatch({ patch })).toEqual(
		parsePatchFiles(patch, undefined, false).flatMap((result) => result.files),
	);
});

test("rejects omitted parsed files instead of showing a partial diff", () => {
	expect(() =>
		parsePullRequestPatch({
			patch: "",
			files: [{ filename: "missing", status: "added" }],
		}),
	).toThrow();
	expect(parsePullRequestPatch({ patch: "", files: [] })).toEqual([]);
});
