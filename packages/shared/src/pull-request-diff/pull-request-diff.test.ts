import { describe, expect, mock, test } from "bun:test";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fetchPullRequestFilesDiff } from "./pull-request-diff";

const execFileAsync = promisify(execFile);
const baseSha = "a".repeat(40);
const headSha = "b".repeat(40);

type FileEntry = {
	filename: string;
	status: string;
	additions: number;
	deletions: number;
	changes?: number;
	previous_filename?: string;
	patch?: string;
};

function modified(overrides: Partial<FileEntry> = {}): FileEntry {
	return {
		filename: "source.txt",
		status: "modified",
		additions: 1,
		deletions: 1,
		patch: "@@ -1 +1 @@\n-before\n+after",
		...overrides,
	};
}

function added(index: number): FileEntry {
	return modified({
		filename: `file-${index}.txt`,
		status: "added",
		deletions: 0,
		patch: `@@ -0,0 +1 @@\n+line ${index}`,
	});
}

function reader(files: FileEntry[]) {
	const metadata = {
		base: { sha: baseSha },
		head: { sha: headSha },
		changed_files: files.length,
		additions: files.reduce((total, file) => total + file.additions, 0),
		deletions: files.reduce((total, file) => total + file.deletions, 0),
	};
	return {
		metadata,
		readPullRequest: mock(async (): Promise<unknown> => metadata),
		readFiles: mock(
			async (page: number, perPage: number): Promise<unknown> =>
				files.slice((page - 1) * perPage, page * perPage),
		),
	};
}

async function applyPatch(
	patch: string,
	originals: Record<string, string>,
	expected: Record<string, string | null>,
) {
	const directory = await mkdtemp(join(tmpdir(), "superset-api-patch-test-"));
	try {
		await Promise.all(
			Object.entries(originals).map(([path, contents]) =>
				writeFile(join(directory, path), contents),
			),
		);
		const patchPath = join(directory, "input.patch");
		await writeFile(patchPath, patch);
		await execFileAsync("git", ["apply", "--whitespace=nowarn", patchPath], {
			cwd: directory,
			env: Object.fromEntries(
				Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
			),
		});
		for (const [path, contents] of Object.entries(expected)) {
			if (contents === null) {
				expect(existsSync(join(directory, path))).toBe(false);
			} else {
				expect(await readFile(join(directory, path), "utf8")).toBe(contents);
			}
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

describe("complete patches from GitHub file pages", () => {
	test("assembles modifications, additions, deletions and edited renames with exact metadata", async () => {
		const files = [
			modified(),
			added(1),
			modified({
				filename: "removed.txt",
				status: "removed",
				additions: 0,
				patch: "@@ -1 +0,0 @@\n-obsolete",
			}),
			modified({
				filename: "renamed.txt",
				previous_filename: "original.txt",
				status: "renamed",
			}),
		];
		const { patch, files: metadata } = await fetchPullRequestFilesDiff(
			reader(files),
		);
		expect(metadata).toEqual([
			{ filename: "source.txt", status: "modified" },
			{ filename: "file-1.txt", status: "added" },
			{ filename: "removed.txt", status: "removed" },
			{
				filename: "renamed.txt",
				previousFilename: "original.txt",
				status: "renamed",
			},
		]);
		expect(patch).not.toContain("file mode");
		expect(patch.match(/^diff --git /gm)).toHaveLength(4);
		expect(patch).toContain("--- /dev/null\n+++ b/file-1.txt");
		expect(patch).toContain("--- a/removed.txt\n+++ /dev/null");
	});

	test("preserves literal backslashes and leading and trailing spaces in rename paths", async () => {
		const oldPath = String.raw` old\name.txt `;
		const newPath = String.raw` new\name.txt `;
		const { patch } = await fetchPullRequestFilesDiff(
			reader([
				modified({
					filename: newPath,
					previous_filename: oldPath,
					status: "renamed",
				}),
			]),
		);
		await applyPatch(
			patch,
			{ [oldPath]: "before\n" },
			{ [oldPath]: null, [newPath]: "after\n" },
		);
	});

	test.each([
		"space name.txt",
		'quote"name.txt',
		"tab\tname.txt",
		"line\nname.txt",
		"日本語.txt",
	])("preserves the changed path %j", async (filename) => {
		const { patch } = await fetchPullRequestFilesDiff(
			reader([modified({ filename })]),
		);
		await applyPatch(
			patch,
			{ [filename]: "before\n" },
			{ [filename]: "after\n" },
		);
	});

	test("accepts a pure rename with no hunks and keeps the old path", async () => {
		const { patch } = await fetchPullRequestFilesDiff(
			reader([
				modified({
					filename: "renamed.txt",
					previous_filename: "original.txt",
					status: "renamed",
					additions: 0,
					deletions: 0,
					patch: undefined,
				}),
			]),
		);
		await applyPatch(
			patch,
			{ "original.txt": "unchanged\n" },
			{ "original.txt": null, "renamed.txt": "unchanged\n" },
		);
	});

	test("handles omitted single-line hunk counts and no-final-newline markers", async () => {
		const { patch } = await fetchPullRequestFilesDiff(
			reader([
				modified({
					patch:
						"@@ -1 +1 @@\n-before\n\\ No newline at end of file\n+after\n\\ No newline at end of file",
				}),
			]),
		);
		await applyPatch(
			patch,
			{ "source.txt": "before" },
			{ "source.txt": "after" },
		);
	});

	test("keeps patch syntax inside changed file contents distinct from patch headers", async () => {
		const { patch } = await fetchPullRequestFilesDiff(
			reader([
				modified({
					additions: 3,
					deletions: 3,
					patch:
						"@@ -1,3 +1,3 @@\n---- old-before\n-+++ old-after\n-@@ -1 +1 @@\n+--- new-before\n++++ new-after\n+@@ -2 +2 @@",
				}),
			]),
		);
		await applyPatch(
			patch,
			{ "source.txt": "--- old-before\n+++ old-after\n@@ -1 +1 @@\n" },
			{ "source.txt": "--- new-before\n+++ new-after\n@@ -2 +2 @@\n" },
		);
	});

	test("preserves separate hunks and unchanged context between them", async () => {
		const { patch } = await fetchPullRequestFilesDiff(
			reader([
				modified({
					additions: 2,
					deletions: 2,
					patch:
						"@@ -1,2 +1,2 @@\n-before\n+after\n context\n@@ -5,2 +5,2 @@ section title\n-before\n+after\n end",
				}),
			]),
		);
		await applyPatch(
			patch,
			{ "source.txt": "before\ncontext\nuntouched\nuntouched\nbefore\nend\n" },
			{ "source.txt": "after\ncontext\nuntouched\nuntouched\nafter\nend\n" },
		);
	});

	test.each([
		1, 99, 100, 101, 200, 3000,
	])("reads exactly all %i files with bounded pages", async (count) => {
		const source = reader(
			Array.from({ length: count }, (_, index) => added(index)),
		);
		const { patch } = await fetchPullRequestFilesDiff(source);
		expect(patch.match(/^diff --git /gm)).toHaveLength(count);
		expect(source.readFiles.mock.calls).toEqual(
			Array.from({ length: Math.ceil(count / 100) }, (_, index) => [
				index + 1,
				100,
			]),
		);
		expect(source.readPullRequest).toHaveBeenCalledTimes(2);
	});

	test("returns an empty patch only for a stable empty PR", async () => {
		const source = reader([]);
		expect(await fetchPullRequestFilesDiff(source)).toEqual({
			patch: "",
			files: [],
		});
		expect(source.readFiles).not.toHaveBeenCalled();
		expect(source.readPullRequest).toHaveBeenCalledTimes(2);
	});
});

describe("rejects incomplete API patches", () => {
	test.each([
		modified({ filename: "binary.dat", patch: undefined }),
		modified({ additions: 0, deletions: 0, patch: undefined }),
		modified({ status: "added", additions: 0, deletions: 0, patch: undefined }),
		modified({
			filename: "renamed.txt",
			previous_filename: "original.txt",
			status: "renamed",
			patch: undefined,
		}),
		modified({ patch: "" }),
	])("rejects an omitted patch instead of dropping its file: %j", async (file) => {
		await expect(fetchPullRequestFilesDiff(reader([file]))).rejects.toThrow();
	});

	test.each([
		"@@ -1,2 +1,2 @@\n-before\n+after",
		"@@ -1 +1 @@\n-before",
		"@@ -1 +1 @@\n-before\n+after\n+extra",
		"@@ -1 +1 @@\n-before\n+after\n@@ -5 +5 @@\n-other",
		"not a unified patch",
		"@@ -1 +1 @@\n-before\n+after\ndiff --git a/hidden b/hidden",
	])("rejects malformed or cut-off hunks: %j", async (patch) => {
		await expect(
			fetchPullRequestFilesDiff(reader([modified({ patch })])),
		).rejects.toThrow();
	});

	test("rejects a syntactically complete patch with missing changes", async () => {
		await expect(
			fetchPullRequestFilesDiff(
				reader([modified({ additions: 2, deletions: 2 })]),
			),
		).rejects.toThrow();
	});

	test.each([
		{
			filename: "source.txt",
			status: "modified",
			patch: "@@ -1 +1 @@\n-before\n+after",
		},
		modified({ status: "unknown" }),
		modified({ filename: "" }),
		modified({ additions: -1 }),
		modified({ deletions: 1.5 }),
		modified({ changes: 17 }),
		modified({ status: "renamed", previous_filename: undefined }),
		null,
	])("rejects malformed file entries rather than skipping them: %j", async (file) => {
		const source = reader([modified()]);
		source.readFiles.mockResolvedValue([file]);
		await expect(fetchPullRequestFilesDiff(source)).rejects.toThrow();
	});

	test("rejects duplicate files across pages", async () => {
		const files = Array.from({ length: 101 }, (_, index) => added(index));
		const source = reader(files);
		source.readFiles
			.mockResolvedValueOnce(files.slice(0, 100))
			.mockResolvedValueOnce([files[0]]);
		await expect(fetchPullRequestFilesDiff(source)).rejects.toThrow();
	});

	test.each([
		[],
		[added(1), added(2)],
		{ files: [added(1)] },
	])("rejects a file response that does not match the expected count: %j", async (response) => {
		const source = reader([added(1)]);
		source.readFiles.mockResolvedValue(response);
		await expect(fetchPullRequestFilesDiff(source)).rejects.toThrow();
	});

	test("rejects a short intermediate page without calling the result complete", async () => {
		const files = Array.from({ length: 101 }, (_, index) => added(index));
		const source = reader(files);
		source.readFiles.mockResolvedValueOnce(files.slice(0, 99));
		await expect(fetchPullRequestFilesDiff(source)).rejects.toThrow();
	});

	test("refuses PRs beyond the files API ceiling before reading any pages", async () => {
		const source = reader([added(1)]);
		source.readPullRequest.mockResolvedValue({
			...source.metadata,
			changed_files: 3001,
		});
		await expect(fetchPullRequestFilesDiff(source)).rejects.toThrow();
		expect(source.readFiles).not.toHaveBeenCalled();
	});

	test.each([
		"additions",
		"deletions",
	] as const)("rejects metadata %s totals that disagree with file totals", async (field) => {
		const source = reader([modified()]);
		source.readPullRequest.mockResolvedValue({
			...source.metadata,
			[field]: 2,
		});
		await expect(fetchPullRequestFilesDiff(source)).rejects.toThrow();
	});
});

describe("consistent PR snapshots", () => {
	test.each([
		{ base: { sha: "c".repeat(40) } },
		{ head: { sha: "d".repeat(40) } },
		{ changed_files: 2 },
		{ additions: 2 },
		{ deletions: 2 },
	])("rejects a PR that changes during pagination: %j", async (change) => {
		const source = reader([modified()]);
		source.readPullRequest
			.mockResolvedValueOnce(source.metadata)
			.mockResolvedValueOnce({ ...source.metadata, ...change });
		await expect(fetchPullRequestFilesDiff(source)).rejects.toThrow();
	});

	test.each([
		{ base: { sha: "main" } },
		{ head: { sha: "topic" } },
		{ changed_files: -1 },
		{ additions: "1" },
		{ deletions: undefined },
	])("rejects invalid metadata before reading files: %j", async (change) => {
		const source = reader([modified()]);
		source.readPullRequest.mockResolvedValue({ ...source.metadata, ...change });
		await expect(fetchPullRequestFilesDiff(source)).rejects.toThrow();
		expect(source.readFiles).not.toHaveBeenCalled();
	});

	test("preserves the original page failure instead of returning earlier pages", async () => {
		const files = Array.from({ length: 101 }, (_, index) => added(index));
		const source = reader(files);
		const error = new Error("second page unavailable");
		source.readFiles
			.mockResolvedValueOnce(files.slice(0, 100))
			.mockRejectedValueOnce(error);
		await expect(fetchPullRequestFilesDiff(source)).rejects.toBe(error);
	});

	test("rejects a patch when its final metadata check fails", async () => {
		const source = reader([modified()]);
		const error = new Error("unable to verify PR head");
		source.readPullRequest
			.mockResolvedValueOnce(source.metadata)
			.mockRejectedValueOnce(error);
		await expect(fetchPullRequestFilesDiff(source)).rejects.toBe(error);
	});
});
