import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FsWatcherManager, isRelPathUnderPrunedDirs } from "./watch";

const tempRoots: string[] = [];
const managers: FsWatcherManager[] = [];

afterEach(async () => {
	await Promise.all(managers.splice(0).map((m) => m.close()));
	await Promise.all(
		tempRoots
			.splice(0)
			.map((root) => fs.rm(root, { recursive: true, force: true })),
	);
});

async function createTempRoot(): Promise<string> {
	const tempPath = await fs.mkdtemp(path.join(os.tmpdir(), "watch-ignored-"));
	const real = await fs.realpath(tempPath);
	tempRoots.push(real);
	return real;
}

async function waitFor(
	seen: string[],
	needle: string,
	timeoutMs = 8_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!seen.includes(needle)) {
		if (Date.now() > deadline) {
			throw new Error(
				`Timed out waiting for ${needle}\nseen: ${seen.join(", ")}`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

describe("FsWatcherManager gitignored-dir pruning", () => {
	it("does not emit events inside a provider-reported ignored dir", async () => {
		const rootPath = await createTempRoot();
		// A repo-specific build dir the static ignore list can't know about.
		const ignoredDir = path.join(rootPath, "generated", "__pycache__");
		await fs.mkdir(ignoredDir, { recursive: true });

		const manager = new FsWatcherManager({
			debounceMs: 50,
			listGitIgnoredDirs: async () => ["generated/__pycache__"],
		});
		managers.push(manager);

		const seen: string[] = [];
		await manager.subscribe({ absolutePath: rootPath }, (batch) => {
			for (const event of batch.events) {
				seen.push(`${event.kind}:${event.absolutePath}`);
			}
		});

		await fs.writeFile(path.join(ignoredDir, "module.pyc"), "x");
		// A sibling write must still surface, proving the stream is live and the
		// prune (not a dead watcher) suppressed the ignored event.
		const siblingFile = path.join(rootPath, "generated", "kept.py");
		await fs.writeFile(siblingFile, "x");

		await waitFor(seen, `create:${siblingFile}`);
		expect(seen).not.toContain(`create:${path.join(ignoredDir, "module.pyc")}`);
	}, 20_000);

	it("prunes an ignored dir with a unicode (NFC) name on darwin's NFD filesystem", async () => {
		const rootPath = await createTempRoot();
		// "café" in NFC — APFS lookups are normalization-insensitive, and git
		// (core.precomposeunicode) reports NFC; the glob must still prune.
		const dirName = "café-out";
		await fs.mkdir(path.join(rootPath, dirName), { recursive: true });

		const manager = new FsWatcherManager({
			debounceMs: 50,
			listGitIgnoredDirs: async () => [dirName],
		});
		managers.push(manager);

		const seen: string[] = [];
		await manager.subscribe({ absolutePath: rootPath }, (batch) => {
			for (const event of batch.events) {
				seen.push(`${event.kind}:${event.absolutePath}`);
			}
		});

		await fs.writeFile(path.join(rootPath, dirName, "junk.js"), "x");
		const probeFile = path.join(rootPath, "probe.ts");
		await fs.writeFile(probeFile, "x");

		await waitFor(seen, `create:${probeFile}`);
		expect(seen.some((entry) => entry.includes(`${dirName}/junk.js`))).toBe(
			false,
		);
	}, 20_000);

	it("prunes through a symlinked watch root and maps events back to the symlink form", async () => {
		const realRoot = await createTempRoot();
		const ignoredDir = path.join(realRoot, "buildout");
		await fs.mkdir(ignoredDir, { recursive: true });
		// Watch via a symlink to the root — the ignore provider must be asked
		// with the RESOLVED path (globs are relative to what parcel watches),
		// and emitted events must come back in symlink form.
		const linkParent = await createTempRoot();
		const linkRoot = path.join(linkParent, "linked-root");
		await fs.symlink(realRoot, linkRoot);

		const providerCalls: string[] = [];
		const manager = new FsWatcherManager({
			debounceMs: 50,
			listGitIgnoredDirs: async (rootPath) => {
				providerCalls.push(rootPath);
				return ["buildout"];
			},
		});
		managers.push(manager);

		const seen: string[] = [];
		await manager.subscribe({ absolutePath: linkRoot }, (batch) => {
			for (const event of batch.events) {
				seen.push(`${event.kind}:${event.absolutePath}`);
			}
		});
		expect(providerCalls).toEqual([realRoot]);

		await fs.writeFile(path.join(ignoredDir, "junk.js"), "x");
		const probeLinkForm = path.join(linkRoot, "probe.ts");
		await fs.writeFile(path.join(realRoot, "probe.ts"), "x");

		await waitFor(seen, `create:${probeLinkForm}`);
		expect(seen.some((entry) => entry.includes("buildout/junk.js"))).toBe(
			false,
		);

		// isPathPruned must answer in the caller's (symlink) path space too.
		expect(
			manager.isPathPruned(linkRoot, path.join(linkRoot, "buildout", "x.js")),
		).toBe(true);
		expect(manager.isPathPruned(linkRoot, path.join(linkRoot, "src.ts"))).toBe(
			false,
		);
	}, 20_000);

	it("still watches when the provider throws", async () => {
		const rootPath = await createTempRoot();
		const manager = new FsWatcherManager({
			debounceMs: 50,
			listGitIgnoredDirs: async () => {
				throw new Error("git exploded");
			},
		});
		managers.push(manager);

		const seen: string[] = [];
		await manager.subscribe({ absolutePath: rootPath }, (batch) => {
			for (const event of batch.events) {
				seen.push(`${event.kind}:${event.absolutePath}`);
			}
		});

		const rootFile = path.join(rootPath, "tracked.ts");
		await fs.writeFile(rootFile, "x");
		await waitFor(seen, `create:${rootFile}`);
	}, 20_000);
});

describe("isRelPathUnderPrunedDirs", () => {
	it("matches static default dirs at any depth, dynamic prefixes only at root", () => {
		expect(isRelPathUnderPrunedDirs("node_modules/pkg/index.js", [])).toBe(
			true,
		);
		expect(isRelPathUnderPrunedDirs("apps/web/dist/main.js", [])).toBe(true);
		expect(isRelPathUnderPrunedDirs(".claude/worktrees/x/file.ts", [])).toBe(
			true,
		);
		expect(isRelPathUnderPrunedDirs("src/app.ts", [])).toBe(false);
		// A file merely named like an ignored dir is not inside one.
		expect(isRelPathUnderPrunedDirs("dist", [])).toBe(false);
		expect(isRelPathUnderPrunedDirs("distance/file.ts", [])).toBe(false);

		expect(
			isRelPathUnderPrunedDirs("generated/__pycache__/m.pyc", [
				"generated/__pycache__",
			]),
		).toBe(true);
		expect(
			isRelPathUnderPrunedDirs("generated/other.py", ["generated/__pycache__"]),
		).toBe(false);
	});
});

describe("FsWatcherManager.isPathPruned", () => {
	it("reports pruned subtrees, covered files, and unknown roots correctly", async () => {
		const rootPath = await createTempRoot();
		await fs.mkdir(path.join(rootPath, "buildout"), { recursive: true });

		const manager = new FsWatcherManager({
			debounceMs: 50,
			listGitIgnoredDirs: async () => ["buildout"],
		});
		managers.push(manager);

		// Unknown root (no subscription yet): err toward "pruned".
		expect(manager.isPathPruned(rootPath, path.join(rootPath, "a.ts"))).toBe(
			true,
		);

		await manager.subscribe({ absolutePath: rootPath }, () => {});

		expect(manager.isPathPruned(rootPath, path.join(rootPath, "a.ts"))).toBe(
			false,
		);
		expect(
			manager.isPathPruned(rootPath, path.join(rootPath, "buildout", "x.js")),
		).toBe(true);
		expect(
			manager.isPathPruned(
				rootPath,
				path.join(rootPath, "node_modules", "pkg", "i.js"),
			),
		).toBe(true);
		// Outside the root: no coverage from this watcher.
		expect(manager.isPathPruned(rootPath, "/elsewhere/file.ts")).toBe(true);
	}, 20_000);
});

describe("FsWatcherManager.refreshIgnores", () => {
	it("re-attaches after a dir is un-ignored so its events flow again", async () => {
		const rootPath = await createTempRoot();
		const ignoredDir = path.join(rootPath, "buildout");
		await fs.mkdir(ignoredDir, { recursive: true });

		let ignored = ["buildout"];
		const manager = new FsWatcherManager({
			debounceMs: 50,
			listGitIgnoredDirs: async () => ignored,
		});
		managers.push(manager);

		const seen: string[] = [];
		await manager.subscribe({ absolutePath: rootPath }, (batch) => {
			for (const event of batch.events) {
				seen.push(`${event.kind}:${event.absolutePath}`);
			}
		});

		// While ignored: no events from the dir (prove liveness via sibling).
		await fs.writeFile(path.join(ignoredDir, "suppressed.js"), "x");
		const probeFile = path.join(rootPath, "probe.ts");
		await fs.writeFile(probeFile, "x");
		await waitFor(seen, `create:${probeFile}`);
		expect(seen).not.toContain(
			`create:${path.join(ignoredDir, "suppressed.js")}`,
		);

		// Rule removed but no refresh yet → still returns false only when
		// nothing shrank; here it must swap.
		ignored = [];
		expect(await manager.refreshIgnores(rootPath)).toBe(true);

		const nowVisible = path.join(ignoredDir, "now-visible.js");
		await fs.writeFile(nowVisible, "x");
		await waitFor(seen, `create:${nowVisible}`);

		// No shrink → no swap.
		expect(await manager.refreshIgnores(rootPath)).toBe(false);
	}, 30_000);
});
