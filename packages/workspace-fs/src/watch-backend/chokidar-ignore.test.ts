import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { FsWatcherManager } from "../watch";
import { watchSingleFile } from "../watch-file";
import { chokidarWatchBackend } from "./chokidar-backend";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function waitFor(check: () => boolean) {
	const deadline = Date.now() + 3_000;
	while (!check()) {
		if (Date.now() > deadline) throw new Error("Missing watch event");
		await delay(10);
	}
}

test("concurrent roots preserve tracked and explicit file events through detach and reattach", async () => {
	const parent = await realpath(
		await mkdtemp(path.join(tmpdir(), "ignore-roots-")),
	);
	cleanups.push(() => rm(parent, { recursive: true, force: true }));
	const roots = Array.from({ length: 4 }, (_, i) =>
		path.join(parent, `root-${i}`),
	);
	for (const root of roots) {
		await mkdir(path.join(root, "packages/p0/vendor"), { recursive: true });
		await mkdir(path.join(root, "build"), { recursive: true });
		await writeFile(path.join(root, "packages/p0/vendor/open.ts"), "initial");
		await writeFile(path.join(root, "build/tracked.ts"), "initial");
	}
	const ignored = Array.from(
		{ length: 200 },
		(_, i) => `packages/p${i}/vendor`,
	);
	const manager = new FsWatcherManager({
		backend: chokidarWatchBackend,
		useDefaultIgnores: false,
		listGitIgnoredDirs: async () => ignored,
		debounceMs: 10,
	});
	cleanups.push(() => manager.close());
	const seen = new Set<string>();
	const unsubscribes = await Promise.all(
		roots.map((root) =>
			manager.subscribe({ absolutePath: root }, ({ events }) => {
				for (const event of events) seen.add(event.absolutePath);
			}),
		),
	);
	const firstRoot = roots[0] as string;
	const openFile = path.join(firstRoot, "packages/p0/vendor/open.ts");
	expect(manager.isPathPruned(firstRoot, openFile)).toBe(true);
	let openFileUpdated = false;
	cleanups.push(
		watchSingleFile(
			openFile,
			() => {
				openFileUpdated = true;
			},
			{ debounceMs: 10 },
		),
	);
	await delay(100);
	for (const root of roots) {
		await writeFile(path.join(root, "packages/p0/vendor/open.ts"), "updated");
		await writeFile(path.join(root, "build/tracked.ts"), "updated");
	}
	await waitFor(
		() =>
			openFileUpdated &&
			roots.every((root) => seen.has(path.join(root, "build/tracked.ts"))),
	);
	for (const root of roots) {
		expect(seen.has(path.join(root, "packages/p0/vendor/open.ts"))).toBe(false);
		expect(
			manager.isPathPruned(root, path.join(root, "build/tracked.ts")),
		).toBe(false);
	}
	await Promise.all(unsubscribes.map((unsubscribe) => unsubscribe()));
	seen.clear();
	await manager.subscribe({ absolutePath: firstRoot }, ({ events }) => {
		for (const event of events) seen.add(`${event.kind}:${event.absolutePath}`);
	});
	const created = path.join(firstRoot, "build/new.ts");
	await writeFile(created, "new");
	await waitFor(() => seen.has(`create:${created}`));
	await rm(created);
	await waitFor(() => seen.has(`delete:${created}`));
}, 10_000);
