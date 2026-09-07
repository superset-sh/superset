import { afterEach, describe, expect, it, spyOn } from "bun:test";
import nodeFs from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import fg from "fast-glob";
import type { SearchPatchEvent } from "./search";
import {
	collectSearchIndexPaths,
	invalidateAllSearchIndexes,
	patchSearchIndexesForRoot,
	searchFiles,
} from "./search";

const tempRoots: string[] = [];

afterEach(async () => {
	invalidateAllSearchIndexes();
	await Promise.all(
		tempRoots.splice(0, tempRoots.length).map(async (rootPath) => {
			await fs.rm(rootPath, { recursive: true, force: true });
		}),
	);
});

async function createTempRoot(): Promise<string> {
	const rootPath = await fs.mkdtemp(
		path.join(os.tmpdir(), "workspace-fs-search-"),
	);
	tempRoots.push(rootPath);
	return rootPath;
}

function createPatchEvent(event: SearchPatchEvent): SearchPatchEvent {
	return event;
}

describe("patchSearchIndexesForRoot", () => {
	it("adds created files to an existing visible search index", async () => {
		const rootPath = await createTempRoot();
		await fs.writeFile(
			path.join(rootPath, "alpha.ts"),
			"export const alpha = 1;\n",
		);

		await searchFiles({
			rootPath,
			query: "alpha",
		});

		const betaPath = path.join(rootPath, "beta.ts");
		await fs.writeFile(betaPath, "export const beta = 2;\n");

		patchSearchIndexesForRoot(rootPath, [
			createPatchEvent({
				kind: "create",
				absolutePath: betaPath,
				isDirectory: false,
			}),
		]);

		const results = await searchFiles({
			rootPath,
			query: "beta",
		});

		expect(results.map((result) => result.absolutePath)).toContain(betaPath);
	});

	it("removes deleted files from an existing visible search index", async () => {
		const rootPath = await createTempRoot();
		const alphaPath = path.join(rootPath, "alpha.ts");
		await fs.writeFile(alphaPath, "export const alpha = 1;\n");

		await searchFiles({
			rootPath,
			query: "alpha",
		});

		await fs.rm(alphaPath);

		patchSearchIndexesForRoot(rootPath, [
			createPatchEvent({
				kind: "delete",
				absolutePath: alphaPath,
				isDirectory: false,
			}),
		]);

		const results = await searchFiles({
			rootPath,
			query: "alpha",
		});

		expect(results).toHaveLength(0);
	});

	it("keeps hidden files out of visible indexes while updating hidden indexes", async () => {
		const rootPath = await createTempRoot();
		await searchFiles({
			rootPath,
			query: "bootstrap",
		});
		await searchFiles({
			rootPath,
			query: "bootstrap",
			includeHidden: true,
		});

		const hiddenPath = path.join(rootPath, ".env.local");
		await fs.writeFile(hiddenPath, "SECRET_TOKEN=1\n");

		patchSearchIndexesForRoot(rootPath, [
			createPatchEvent({
				kind: "create",
				absolutePath: hiddenPath,
				isDirectory: false,
			}),
		]);

		const visibleResults = await searchFiles({
			rootPath,
			query: ".env",
		});
		const hiddenResults = await searchFiles({
			rootPath,
			query: ".env",
			includeHidden: true,
		});

		expect(visibleResults).toHaveLength(0);
		expect(hiddenResults.map((result) => result.absolutePath)).toContain(
			hiddenPath,
		);
	});

	it("rebuilds search indexes after a directory rename", async () => {
		const rootPath = await createTempRoot();
		const oldDirectoryPath = path.join(rootPath, "old-dir");
		const newDirectoryPath = path.join(rootPath, "new-dir");
		const oldFilePath = path.join(oldDirectoryPath, "target.ts");
		const newFilePath = path.join(newDirectoryPath, "target.ts");

		await fs.mkdir(oldDirectoryPath, { recursive: true });
		await fs.writeFile(oldFilePath, "export const target = 1;\n");

		await searchFiles({
			rootPath,
			query: "old-dir/target.ts",
		});

		await fs.rename(oldDirectoryPath, newDirectoryPath);

		patchSearchIndexesForRoot(rootPath, [
			createPatchEvent({
				kind: "rename",
				absolutePath: newDirectoryPath,
				oldAbsolutePath: oldDirectoryPath,
				isDirectory: true,
			}),
		]);

		const oldPathResults = await searchFiles({
			rootPath,
			query: "old-dir/target.ts",
		});
		const newPathResults = await searchFiles({
			rootPath,
			query: "new-dir/target.ts",
		});

		expect(
			oldPathResults.some(
				(result) => result.relativePath === "old-dir/target.ts",
			),
		).toEqual(false);
		expect(newPathResults[0]?.absolutePath).toEqual(newFilePath);
		expect(newPathResults[0]?.relativePath).toEqual("new-dir/target.ts");
	});
});

describe("searchFiles", () => {
	it("prioritizes exact filename matches ahead of fuzzy path matches", async () => {
		const rootPath = await createTempRoot();
		const exactMatchPath = path.join(rootPath, "WorkspaceFiles.tsx");
		const fuzzyMatchPath = path.join(rootPath, "hooks", "useWorkspaceFiles.ts");

		await fs.mkdir(path.dirname(fuzzyMatchPath), { recursive: true });
		await fs.writeFile(exactMatchPath, "export const exact = true;\n");
		await fs.writeFile(fuzzyMatchPath, "export const fuzzy = true;\n");

		const results = await searchFiles({
			rootPath,
			query: "WorkspaceFiles.tsx",
			limit: 5,
		});

		expect(results[0]?.absolutePath).toEqual(exactMatchPath);
		expect(results).toHaveLength(1);

		const fuzzyResults = await searchFiles({
			rootPath,
			query: "useWorkspaceFiles",
			limit: 5,
		});

		expect(fuzzyResults[0]?.absolutePath).toEqual(fuzzyMatchPath);
	});

	it("normalizes exact relative path queries before lookup", async () => {
		const rootPath = await createTempRoot();
		const targetPath = path.join(rootPath, "src", "file.ts");

		await fs.mkdir(path.dirname(targetPath), { recursive: true });
		await fs.writeFile(targetPath, "export const value = true;\n");

		const results = await searchFiles({
			rootPath,
			query: "./src/file.ts",
			limit: 5,
		});

		expect(results[0]?.absolutePath).toEqual(targetPath);
		expect(results[0]?.relativePath).toEqual("src/file.ts");
	});

	it("returns every compact path collision instead of dropping later entries", async () => {
		const rootPath = await createTempRoot();
		const nestedPath = path.join(rootPath, "foo", "bar.ts");
		const flatPath = path.join(rootPath, "foo-bar.ts");

		await fs.mkdir(path.dirname(nestedPath), { recursive: true });
		await fs.writeFile(nestedPath, "export const nested = true;\n");
		await fs.writeFile(flatPath, "export const flat = true;\n");

		const results = await searchFiles({
			rootPath,
			query: "foobarts",
			limit: 5,
		});

		const paths = results.map((result) => result.absolutePath);
		expect(paths).toContain(flatPath);
		expect(paths).toContain(nestedPath);
		expect(paths).toHaveLength(2);
	});
});

describe("collectSearchIndexPaths", () => {
	it("stops the walk at the entry cap and reports truncation", async () => {
		const rootPath = await fs.mkdtemp(
			path.join(os.tmpdir(), "workspace-fs-index-cap-"),
		);
		try {
			for (let i = 0; i < 12; i++) {
				await fs.writeFile(path.join(rootPath, `file-${i}.txt`), "x");
			}
			const capped = await collectSearchIndexPaths(rootPath, {
				includeHidden: false,
				maxEntries: 5,
			});
			expect(capped.paths).toHaveLength(5);
			expect(capped.truncated).toBe(true);

			const full = await collectSearchIndexPaths(rootPath, {
				includeHidden: false,
			});
			expect(full.paths).toHaveLength(12);
			expect(full.truncated).toBe(false);
		} finally {
			await fs.rm(rootPath, { recursive: true, force: true });
		}
	});

	it("destroys the directory walk at the cap instead of running it to completion", async () => {
		const rootPath = await createTempRoot();
		const DIRS = 400;
		const FILES = 3;
		for (let d = 0; d < DIRS; d++) {
			const dir = path.join(rootPath, `dir-${d}`);
			await fs.mkdir(dir);
			for (let f = 0; f < FILES; f++) {
				await fs.writeFile(path.join(dir, `file-${f}.txt`), "x");
			}
		}

		// search.ts looks `fg.stream` up on the fast-glob module object at call
		// time, so a spy here can route the walk through a counting readdir and
		// keep a handle on the stream the walk consumes.
		let readdirCalls = 0;
		const countingReaddir = ((...args: unknown[]) => {
			readdirCalls++;
			return (nodeFs.readdir as (...a: unknown[]) => void)(...args);
		}) as typeof nodeFs.readdir;
		const originalStream = fg.stream;
		const streams: Readable[] = [];
		const streamSpy = spyOn(fg, "stream").mockImplementation(
			(source, options) => {
				const stream = originalStream(source, {
					...options,
					fs: { readdir: countingReaddir },
				});
				streams.push(stream as Readable);
				return stream;
			},
		);
		try {
			const full = await collectSearchIndexPaths(rootPath, {
				includeHidden: false,
			});
			expect(full.paths).toHaveLength(DIRS * FILES);
			expect(full.truncated).toBe(false);
			const fullReaddirs = readdirCalls;
			expect(fullReaddirs).toBe(DIRS + 1);
			expect(streams[0]?.readableEnded).toBe(true);

			readdirCalls = 0;
			const capped = await collectSearchIndexPaths(rootPath, {
				includeHidden: false,
				maxEntries: FILES,
			});
			expect(capped.paths).toHaveLength(FILES);
			expect(capped.truncated).toBe(true);
			const cappedReaddirs = readdirCalls;

			// The stream was torn down early, not read to its natural end.
			expect(streams[1]?.destroyed).toBe(true);
			expect(streams[1]?.readableEnded).toBe(false);

			// Directories still in flight when the cap hit (bounded by fast-glob's
			// concurrency, the CPU count) may finish, but the walker opens no
			// more: the count is frozen, not merely lagging.
			await new Promise((resolve) => setTimeout(resolve, 150));
			expect(readdirCalls).toBe(cappedReaddirs);
			expect(cappedReaddirs).toBeLessThan(fullReaddirs / 2);
		} finally {
			streamSpy.mockRestore();
		}
	});
});
