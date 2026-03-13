import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	invalidateAllSearchIndexes,
	patchSearchIndexesForRoot,
	searchFiles,
} from "./search";
import type { WorkspaceFsWatchEvent } from "./types";

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

function createFileEvent(
	event: Omit<
		Extract<WorkspaceFsWatchEvent, { type: "create" | "update" | "delete" }>,
		"workspaceId"
	>,
): Extract<WorkspaceFsWatchEvent, { type: "create" | "update" | "delete" }> {
	return {
		workspaceId: "workspace-test",
		...event,
	};
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
			createFileEvent({
				type: "create",
				absolutePath: betaPath,
				isDirectory: false,
				revision: 1,
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
			createFileEvent({
				type: "delete",
				absolutePath: alphaPath,
				isDirectory: false,
				revision: 1,
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
			createFileEvent({
				type: "create",
				absolutePath: hiddenPath,
				isDirectory: false,
				revision: 1,
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
});
