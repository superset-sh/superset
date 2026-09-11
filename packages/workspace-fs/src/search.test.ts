import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SearchPatchEvent } from "./search";
import {
	invalidateAllSearchIndexes,
	patchSearchIndexesForRoot,
	searchContent,
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

describe("search path filters", () => {
	async function createFilterFixture(): Promise<string> {
		const rootPath = await createTempRoot();
		await fs.mkdir(path.join(rootPath, "src", "deep"), { recursive: true });
		await fs.writeFile(path.join(rootPath, "a.ts"), "");
		await fs.writeFile(path.join(rootPath, "src", "b.ts"), "");
		await fs.writeFile(path.join(rootPath, "src", "deep", "c.ts"), "");
		await fs.writeFile(path.join(rootPath, "src", "deep", "d.js"), "");
		return rootPath;
	}

	async function relativeMatches(
		rootPath: string,
		filters: { includePattern?: string; excludePattern?: string },
	): Promise<string[]> {
		const results = await searchFiles({
			rootPath,
			query: "ts",
			limit: 20,
			...filters,
		});
		return results.map((match) => match.relativePath).sort();
	}

	it("applies include and exclude globs", async () => {
		const rootPath = await createFilterFixture();

		expect(
			await relativeMatches(rootPath, { includePattern: "src/**" }),
		).toEqual(["src/b.ts", "src/deep/c.ts"]);
		expect(await relativeMatches(rootPath, { includePattern: "*.ts" })).toEqual(
			["a.ts", "src/b.ts", "src/deep/c.ts"],
		);
		expect(await relativeMatches(rootPath, { includePattern: "?.ts" })).toEqual(
			["a.ts", "src/b.ts", "src/deep/c.ts"],
		);
		expect(
			await relativeMatches(rootPath, { includePattern: "src/?.ts" }),
		).toEqual(["src/b.ts"]);
		expect(
			await relativeMatches(rootPath, {
				includePattern: "src/**/*.ts",
				excludePattern: "**/deep/**",
			}),
		).toEqual(["src/b.ts"]);
		expect(await relativeMatches(rootPath, { includePattern: "src/" })).toEqual(
			["src/b.ts", "src/deep/c.ts"],
		);
	});

	it("evaluates a pathological glob in linear time", async () => {
		const rootPath = await createFilterFixture();
		const startedAt = Date.now();

		expect(
			await relativeMatches(rootPath, {
				includePattern: `${"**/".repeat(40)}x,${"*a".repeat(40)}x`,
				excludePattern: `${"a*".repeat(40)}/b`,
			}),
		).toEqual([]);

		expect(Date.now() - startedAt).toBeLessThan(2_000);
	});
});

describe("searchContent scan fallback", () => {
	it("does not follow a symlink that leaves the workspace", async () => {
		const rootPath = await createTempRoot();
		const outsidePath = await createTempRoot();
		await fs.writeFile(
			path.join(outsidePath, "secret"),
			"hunter2 lives here\n",
		);
		await fs.writeFile(path.join(rootPath, "notes.txt"), "hunter2 in repo\n");
		const linkPath = path.join(rootPath, "leak.txt");
		await fs.symlink(path.join(outsidePath, "secret"), linkPath);
		// Build the index, then let a watcher-style patch add the symlink to it.
		await searchFiles({ rootPath, query: "notes", limit: 5 });
		patchSearchIndexesForRoot(rootPath, [
			createPatchEvent({
				kind: "create",
				absolutePath: linkPath,
				isDirectory: false,
			}),
		]);

		const results = await searchContent({
			rootPath,
			query: "hunter2",
			includeHidden: false,
			runRipgrep: async () => {
				throw new Error("rg unavailable");
			},
		});

		expect(results.map((match) => match.relativePath)).toEqual(["notes.txt"]);
	});
});
