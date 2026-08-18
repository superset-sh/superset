import { describe, expect, test } from "bun:test";
import { buildChangesetFiles } from "./buildChangesetFiles";
import { getChangesetFileKey } from "./changesetFileKey";

describe("buildChangesetFiles", () => {
	test("keeps against-base files visible in all changes when paths overlap dirty buckets", () => {
		const files = buildChangesetFiles(
			{
				againstBase: [
					{
						path: "src/file.ts",
						status: "modified",
						additions: 10,
						deletions: 1,
					},
					{
						path: "src/branch-only.ts",
						status: "added",
						additions: 4,
						deletions: 0,
					},
				],
				staged: [
					{
						path: "src/file.ts",
						status: "modified",
						additions: 2,
						deletions: 0,
					},
				],
				unstaged: [
					{
						path: "src/file.ts",
						status: "modified",
						additions: 1,
						deletions: 3,
					},
				],
			},
			{ kind: "against-base", baseBranch: "main" },
		);

		expect(files.map((file) => [file.source.kind, file.path])).toEqual([
			["unstaged", "src/file.ts"],
			["staged", "src/file.ts"],
			["against-base", "src/file.ts"],
			["against-base", "src/branch-only.ts"],
		]);
		expect(new Set(files.map(getChangesetFileKey)).size).toBe(files.length);
	});

	test("uncommitted filter excludes against-base files", () => {
		const files = buildChangesetFiles(
			{
				againstBase: [
					{
						path: "src/branch-only.ts",
						status: "added",
						additions: 4,
						deletions: 0,
					},
				],
				staged: [
					{
						path: "src/staged.ts",
						status: "modified",
						additions: 2,
						deletions: 0,
					},
				],
				unstaged: [
					{
						path: "src/unstaged.ts",
						status: "modified",
						additions: 1,
						deletions: 3,
					},
				],
			},
			{ kind: "uncommitted" },
		);

		expect(files.map((file) => file.source.kind)).toEqual([
			"unstaged",
			"staged",
		]);
	});
});
