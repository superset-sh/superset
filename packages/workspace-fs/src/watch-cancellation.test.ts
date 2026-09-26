import { afterEach, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFsHostService } from "./host/service";
import { FsWatcherManager } from "./watch";

const roots: string[] = [];
const managers: FsWatcherManager[] = [];
afterEach(async () => {
	await Promise.all(managers.splice(0).map((manager) => manager.close()));
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

async function root() {
	const rootPath = await realpath(
		await mkdtemp(join(tmpdir(), "watch-cancel-")),
	);
	roots.push(rootPath);
	return rootPath;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("closing the last stream cancels shared watcher initialization", async () => {
	const rootPath = await root();
	const started = deferred<AbortSignal>();
	let scans = 0;
	const manager = new FsWatcherManager({
		findNestedRepoRoots: async (_path, { signal }) => {
			scans++;
			if (!signal) throw new Error("Missing scan signal");
			started.resolve(signal);
			return new Promise((_resolve, reject) =>
				signal.addEventListener("abort", () => reject(signal.reason), {
					once: true,
				}),
			);
		},
	});
	managers.push(manager);
	const service = createFsHostService({ rootPath, watcherManager: manager });
	const first = service
		.watchPath({ absolutePath: rootPath })
		[Symbol.asyncIterator]();
	const second = service
		.watchPath({ absolutePath: rootPath })
		[Symbol.asyncIterator]();
	const signal = await started.promise;
	expect(scans).toBe(1);
	const firstNext = first.next();
	await first.return?.();
	expect((await firstNext).done).toBe(true);
	expect(signal.aborted).toBe(false);
	await second.return?.();
	expect(signal.aborted).toBe(true);
});

test("abandoned queued scans never run and a fresh subscription can start", async () => {
	const started = deferred<void>();
	const queued = deferred<void>();
	const gate = deferred<void>();
	const scanned: string[] = [];
	const oldRoot = await root();
	const manager = new FsWatcherManager({
		listGitIgnoredDirs: async (path) => {
			if (path === oldRoot) queued.resolve();
			return [];
		},
		findNestedRepoRoots: async (path, { signal }) => {
			scanned.push(path);
			if (scanned.length === 4) started.resolve();
			await gate.promise;
			signal?.throwIfAborted();
			return { roots: [], truncated: false };
		},
	});
	managers.push(manager);
	const controllers = Array.from({ length: 4 }, () => new AbortController());
	const first = await Promise.all(
		controllers.map(async (controller) => {
			const path = await root();
			return {
				pending: manager
					.subscribe(
						{ absolutePath: path, signal: controller.signal },
						() => {},
					)
					.catch(() => {}),
			};
		}),
	);
	await started.promise;
	const controller = new AbortController();
	const abandoned = manager
		.subscribe({ absolutePath: oldRoot, signal: controller.signal }, () => {})
		.catch(() => {});
	await queued.promise;
	controller.abort();
	await abandoned;
	expect(scanned).not.toContain(oldRoot);
	for (const active of controllers) active.abort();
	gate.resolve();
	await Promise.all(first.map(({ pending }) => pending));
	const dispose = await manager.subscribe({ absolutePath: oldRoot }, () => {});
	expect(scanned).toHaveLength(5);
	expect(scanned[4]).toBe(oldRoot);
	await dispose();
});

test("watcher readiness refreshes edits made during the background scan", async () => {
	const rootPath = await root();
	const started = deferred<void>();
	const gate = deferred<void>();
	const manager = new FsWatcherManager({
		findNestedRepoRoots: async () => {
			started.resolve();
			await gate.promise;
			return { roots: [], truncated: false };
		},
	});
	managers.push(manager);
	const service = createFsHostService({ rootPath, watcherManager: manager });
	const stream = service
		.watchPath({ absolutePath: rootPath })
		[Symbol.asyncIterator]();
	await started.promise;
	await service.writeFile({
		absolutePath: join(rootPath, "during-scan.txt"),
		content: "ready",
		encoding: "utf-8",
		options: { create: true, overwrite: false },
	});
	gate.resolve();
	const batch = await stream.next();
	expect(batch.value?.events).toEqual([
		{ kind: "overflow", absolutePath: rootPath, isDirectory: true },
	]);
	const { entries } = await service.listDirectory({ absolutePath: rootPath });
	expect(entries.map((entry) => entry.name)).toContain("during-scan.txt");
	await stream.return?.();
});
