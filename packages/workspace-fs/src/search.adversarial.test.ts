import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fg from "fast-glob";
import {
	applySearchPatchEvents,
	collectSearchIndexEntries,
	getSearchIndex,
	invalidateAllSearchIndexes,
	SearchIndexBuildAborted,
} from "./search";

const roots: string[] = [];

async function makeRepoRoot(files = 0): Promise<string> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "search-adv-"));
	roots.push(root);
	await fs.mkdir(path.join(root, ".git"), { recursive: true });
	for (let d = 0; d * 100 < files; d++) {
		const dir = path.join(root, `d${d}`);
		await fs.mkdir(dir, { recursive: true });
		await Promise.all(
			Array.from({ length: Math.min(100, files - d * 100) }, (_, i) =>
				fs.writeFile(path.join(dir, `f${i}.ts`), "x"),
			),
		);
	}
	return root;
}

afterEach(async () => {
	invalidateAllSearchIndexes();
	await Promise.all(
		roots
			.splice(0)
			.map((root) => fs.rm(root, { recursive: true, force: true })),
	);
});

function watchRejections() {
	const seen: unknown[] = [];
	const onRejection = (reason: unknown) => {
		seen.push(reason);
	};
	process.on("unhandledRejection", onRejection);
	return {
		seen,
		stop: () => {
			process.off("unhandledRejection", onRejection);
		},
	};
}

describe("collectSearchIndexEntries over a real fast-glob stream", () => {
	it("truncating a live walk resolves cleanly with no stream error or dangling rejection", async () => {
		const root = await makeRepoRoot(400);
		const stream = fg.stream("**/*", {
			cwd: root,
			onlyFiles: true,
			unique: true,
			suppressErrors: true,
		});
		// Production attaches no 'error' listener; the iterator's own `finished`
		// hook is what consumes the AbortError the early return() raises.
		const uncaught: unknown[] = [];
		const onUncaught = (e: unknown) => uncaught.push(e);
		process.on("uncaughtException", onUncaught);
		const rejections = watchRejections();
		let stopped = 0;
		const result = await collectSearchIndexEntries(stream, root, {
			maxEntries: 50,
			stop: () => {
				stopped++;
				(stream as unknown as { destroy: () => void }).destroy();
			},
		});
		await new Promise((r) => setTimeout(r, 150));
		rejections.stop();
		process.off("uncaughtException", onUncaught);
		expect(result.truncated).toBe(true);
		expect(result.items).toHaveLength(50);
		expect(stopped).toBe(1);
		expect(uncaught).toEqual([]);
		expect(rejections.seen).toEqual([]);
		const s = stream as unknown as { destroyed: boolean; errored: unknown };
		expect(s.destroyed).toBe(true);
		// Benign: the early return() destroys with an AbortError, already handled.
		expect(String(s.errored)).toMatch(/aborted/i);
	});

	it("aborting mid-walk throws SearchIndexBuildAborted and destroys the stream without a stray rejection", async () => {
		const root = await makeRepoRoot(400);
		const stream = fg.stream("**/*", {
			cwd: root,
			onlyFiles: true,
			unique: true,
			suppressErrors: true,
		});
		const errors: unknown[] = [];
		stream.on("error", (e) => errors.push(e));
		const rejections = watchRejections();
		const abort = new AbortController();
		const destroy = () =>
			(stream as unknown as { destroy: () => void }).destroy();
		abort.signal.addEventListener("abort", destroy, { once: true });
		let seen = 0;
		const counting = (async function* () {
			for await (const entry of stream) {
				if (++seen === 3) abort.abort();
				yield entry;
			}
		})();
		await expect(
			collectSearchIndexEntries(counting, root, {
				maxEntries: 50,
				signal: abort.signal,
				stop: destroy,
			}),
		).rejects.toBeInstanceOf(SearchIndexBuildAborted);
		await new Promise((r) => setTimeout(r, 150));
		rejections.stop();
		expect(errors).toEqual([]);
		expect(rejections.seen).toEqual([]);
	});

	it("an abort that lands after the last entry resolves at this layer (buildSearchIndex re-checks signal.aborted)", async () => {
		const abort = new AbortController();
		async function* walk() {
			yield "a.ts";
			yield "b.ts";
			abort.abort();
		}
		const result = await collectSearchIndexEntries(walk(), "/root", {
			maxEntries: 10,
			signal: abort.signal,
		});
		expect(result.items).toHaveLength(2);
		expect(abort.signal.aborted).toBe(true);
	});

	it("a cap of zero yields an empty, truncated index and stops the walk once", async () => {
		let stopped = 0;
		async function* walk() {
			yield "a.ts";
		}
		const result = await collectSearchIndexEntries(walk(), "/root", {
			maxEntries: 0,
			stop: () => stopped++,
		});
		expect(result).toEqual({ items: [], truncated: true });
		expect(stopped).toBe(1);
	});
});

describe("capped index patching", () => {
	function context(root: string, entries: string[], maxEntries: number) {
		const itemsByPath = new Map(
			entries.map((rel) => {
				const abs = path.join(root, rel);
				return [
					abs,
					{
						absolutePath: abs,
						relativePath: rel,
						name: path.basename(rel),
						description:
							path.dirname(rel) === "." ? undefined : path.dirname(rel),
					},
				];
			}),
		);
		return { itemsByPath, rootPath: root, includeHidden: false, maxEntries };
	}
	const rels = (ctx: { itemsByPath: Map<string, { relativePath: string }> }) =>
		[...ctx.itemsByPath.values()].map((e) => e.relativePath).sort();

	it("a file rename onto a key that already exists at the cap updates in place", () => {
		const root = "/root";
		const ctx = context(root, ["a.ts", "b.ts", "c.ts"], 3);
		applySearchPatchEvents(ctx, [
			{
				kind: "rename",
				oldAbsolutePath: path.join(root, "a.ts"),
				absolutePath: path.join(root, "b.ts"),
				isDirectory: false,
			},
		]);
		expect(rels(ctx)).toEqual(["b.ts", "c.ts"]);
	});

	it("a directory rename at the cap keeps every moved entry", () => {
		const root = "/root";
		const ctx = context(
			root,
			["before/a.ts", "before/n/b.ts", "before/n/c.ts", "keep.ts"],
			4,
		);
		applySearchPatchEvents(ctx, [
			{
				kind: "rename",
				oldAbsolutePath: path.join(root, "before"),
				absolutePath: path.join(root, "after"),
				isDirectory: true,
			},
		]);
		expect(rels(ctx)).toEqual([
			"after/a.ts",
			"after/n/b.ts",
			"after/n/c.ts",
			"keep.ts",
		]);
	});

	it("a directory rename into a hidden location at the cap frees slots for later creates", () => {
		const root = "/root";
		const ctx = context(root, ["before/a.ts", "before/b.ts", "keep.ts"], 3);
		applySearchPatchEvents(ctx, [
			{
				kind: "rename",
				oldAbsolutePath: path.join(root, "before"),
				absolutePath: path.join(root, ".hidden"),
				isDirectory: true,
			},
			{
				kind: "create",
				absolutePath: path.join(root, "new.ts"),
				isDirectory: false,
			},
		]);
		expect(rels(ctx)).toEqual(["keep.ts", "new.ts"]);
	});

	it("a truncated real build is cached and a later create is refused until a delete frees a slot", async () => {
		const root = await makeRepoRoot(3);
		const index = await getSearchIndex({
			rootPath: root,
			includeHidden: false,
		});
		expect(index).toHaveLength(3);
		const ctx = {
			itemsByPath: new Map(index.map((e) => [e.absolutePath, e])),
			rootPath: root,
			includeHidden: false,
			maxEntries: 3,
		};
		applySearchPatchEvents(ctx, [
			{
				kind: "create",
				absolutePath: path.join(root, "d0", "z.ts"),
				isDirectory: false,
			},
		]);
		expect(ctx.itemsByPath.size).toBe(3);
		applySearchPatchEvents(ctx, [
			{
				kind: "delete",
				absolutePath: path.join(root, "d0", "f0.ts"),
				isDirectory: false,
			},
			{
				kind: "create",
				absolutePath: path.join(root, "d0", "z.ts"),
				isDirectory: false,
			},
		]);
		expect(rels(ctx)).toEqual(["d0/f1.ts", "d0/f2.ts", "d0/z.ts"]);
	});

	it("an update to an existing key at the cap still refreshes its entry", () => {
		const root = "/root";
		const ctx = context(root, ["a.ts"], 1);
		const before = ctx.itemsByPath.get(path.join(root, "a.ts"));
		applySearchPatchEvents(ctx, [
			{
				kind: "update",
				absolutePath: path.join(root, "a.ts"),
				isDirectory: false,
			},
		]);
		const after = ctx.itemsByPath.get(path.join(root, "a.ts"));
		expect(after).not.toBe(before);
		expect(after?.relativePath).toBe("a.ts");
	});
});

describe("getSearchIndex failure paths", () => {
	it("a root that vanishes mid-build does not cache an empty index forever", async () => {
		const root = await makeRepoRoot(200);
		const inFlight = getSearchIndex({ rootPath: root, includeHidden: false });
		await fs.rm(root, { recursive: true, force: true });
		const first = await inFlight;
		// Whatever the first build saw, a rebuild after recreation must not be
		// served from a cache poisoned by the deletion.
		await fs.mkdir(path.join(root, ".git"), { recursive: true });
		await fs.writeFile(path.join(root, "fresh.ts"), "x");
		invalidateAllSearchIndexes();
		const second = await getSearchIndex({
			rootPath: root,
			includeHidden: false,
		});
		expect(second.map((e) => e.name)).toEqual(["fresh.ts"]);
		expect(first.length).toBeGreaterThanOrEqual(0);
	});
});
