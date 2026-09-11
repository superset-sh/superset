import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	getSearchIndex,
	invalidateAllSearchIndexes,
	patchSearchIndexesForRoot,
} from "./search";

const roots: string[] = [];

async function makeRoot(): Promise<string> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "search-bounds-"));
	roots.push(root);
	return root;
}

async function makeRepoRoot(): Promise<string> {
	const root = await makeRoot();
	await fs.mkdir(path.join(root, ".git"), { recursive: true });
	return root;
}

async function writeAtDepth(root: string, depth: number, name: string) {
	const dir = path.join(
		root,
		...Array.from({ length: depth }, (_, i) => `d${i}`),
	);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(path.join(dir, name), "x");
}

afterEach(async () => {
	invalidateAllSearchIndexes();
	await Promise.all(
		roots
			.splice(0)
			.map((root) => fs.rm(root, { recursive: true, force: true })),
	);
});

describe("index walk depth", () => {
	it("indexes arbitrarily deep files inside a git repository", async () => {
		const root = await makeRepoRoot();
		await writeAtDepth(root, 12, "deep.ts");

		const index = await getSearchIndex({
			rootPath: root,
			includeHidden: false,
		});

		expect(index.map((entry) => entry.name)).toContain("deep.ts");
	});

	it("stops descending past the bound outside a git repository", async () => {
		const root = await makeRoot();
		await writeAtDepth(root, 2, "shallow.ts");
		await writeAtDepth(root, 12, "deep.ts");

		const index = await getSearchIndex({
			rootPath: root,
			includeHidden: false,
		});
		const names = index.map((entry) => entry.name);

		expect(names).toContain("shallow.ts");
		expect(names).not.toContain("deep.ts");
	});
});

describe("directory patch events", () => {
	it("removes an indexed subtree when its directory is deleted", async () => {
		const root = await makeRepoRoot();
		await fs.mkdir(path.join(root, "keep"), { recursive: true });
		await fs.mkdir(path.join(root, "drop", "nested"), { recursive: true });
		await fs.writeFile(path.join(root, "keep", "a.ts"), "x");
		await fs.writeFile(path.join(root, "drop", "b.ts"), "x");
		await fs.writeFile(path.join(root, "drop", "nested", "c.ts"), "x");

		await getSearchIndex({ rootPath: root, includeHidden: false });
		await fs.rm(path.join(root, "drop"), { recursive: true, force: true });

		patchSearchIndexesForRoot(root, [
			{
				kind: "delete",
				absolutePath: path.join(root, "drop"),
				isDirectory: true,
			},
		]);

		const index = await getSearchIndex({
			rootPath: root,
			includeHidden: false,
		});
		expect(index.map((entry) => entry.name).sort()).toEqual(["a.ts"]);
	});

	it("re-keys an indexed subtree when its directory is renamed", async () => {
		const root = await makeRepoRoot();
		await fs.mkdir(path.join(root, "before", "nested"), { recursive: true });
		await fs.writeFile(path.join(root, "before", "a.ts"), "x");
		await fs.writeFile(path.join(root, "before", "nested", "b.ts"), "x");

		await getSearchIndex({ rootPath: root, includeHidden: false });
		await fs.rename(path.join(root, "before"), path.join(root, "after"));

		patchSearchIndexesForRoot(root, [
			{
				kind: "rename",
				oldAbsolutePath: path.join(root, "before"),
				absolutePath: path.join(root, "after"),
				isDirectory: true,
			},
		]);

		const index = await getSearchIndex({
			rootPath: root,
			includeHidden: false,
		});
		expect(index.map((entry) => entry.relativePath).sort()).toEqual([
			"after/a.ts",
			"after/nested/b.ts",
		]);
	});

	it("rebuilds when a directory is created, since its contents are unknown", async () => {
		const root = await makeRepoRoot();
		await fs.writeFile(path.join(root, "a.ts"), "x");
		await getSearchIndex({ rootPath: root, includeHidden: false });

		await fs.mkdir(path.join(root, "added"), { recursive: true });
		await fs.writeFile(path.join(root, "added", "b.ts"), "x");

		patchSearchIndexesForRoot(root, [
			{
				kind: "create",
				absolutePath: path.join(root, "added"),
				isDirectory: true,
			},
		]);

		const index = await getSearchIndex({
			rootPath: root,
			includeHidden: false,
		});
		expect(index.map((entry) => entry.name).sort()).toEqual(["a.ts", "b.ts"]);
	});
});

describe("build cancellation", () => {
	async function makeBigRepo(count: number): Promise<string> {
		const root = await makeRoot();
		await fs.mkdir(path.join(root, ".git"), { recursive: true });
		const perDir = 200;
		for (let d = 0; d * perDir < count; d++) {
			const dir = path.join(root, `d${d}`);
			await fs.mkdir(dir, { recursive: true });
			await Promise.all(
				Array.from({ length: perDir }, (_, i) =>
					fs.writeFile(path.join(dir, `f${i}.ts`), "x"),
				),
			);
		}
		return root;
	}

	it("returns an index to the caller when its build is aborted mid-walk", async () => {
		const root = await makeBigRepo(6000);

		const inFlight = getSearchIndex({ rootPath: root, includeHidden: false });
		await new Promise((resolve) => setTimeout(resolve, 1));
		invalidateAllSearchIndexes();

		const index = await inFlight;
		expect(index.length).toBe(6000);
	});

	it("survives repeated invalidation during a build", async () => {
		const root = await makeBigRepo(6000);

		const inFlight = getSearchIndex({ rootPath: root, includeHidden: false });
		await new Promise((resolve) => setTimeout(resolve, 1));
		invalidateAllSearchIndexes();
		await new Promise((resolve) => setTimeout(resolve, 1));
		invalidateAllSearchIndexes();

		const index = await inFlight;
		expect(index.length).toBe(6000);
	});
});

describe("build restart bound", () => {
	it("terminates when a joined build is repeatedly superseded", async () => {
		const root = await makeRoot();
		await fs.mkdir(path.join(root, ".git"), { recursive: true });
		for (let d = 0; d < 30; d++) {
			const dir = path.join(root, `d${d}`);
			await fs.mkdir(dir, { recursive: true });
			await Promise.all(
				Array.from({ length: 200 }, (_, i) =>
					fs.writeFile(path.join(dir, `f${i}.ts`), "x"),
				),
			);
		}

		const owner = getSearchIndex({ rootPath: root, includeHidden: false });
		const joiner = getSearchIndex({ rootPath: root, includeHidden: false });

		const storm = setInterval(() => invalidateAllSearchIndexes(), 1);
		try {
			const settled = await Promise.race([
				Promise.all([owner, joiner]).then(() => "settled" as const),
				new Promise<"hung">((resolve) =>
					setTimeout(() => resolve("hung"), 15_000),
				),
			]);
			expect(settled).toBe("settled");
		} finally {
			clearInterval(storm);
		}
	}, 30_000);
});
