import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FsWatcherManager } from "../watch";
import {
	chokidarWatchBackend,
	createIgnoreMatcher,
	type NativeWatchBackend,
	type NativeWatchEvent,
	parcelWatchBackend,
} from "./index";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function makeRoot(): Promise<string> {
	const root = await realpath(await mkdtemp(path.join(tmpdir(), "wb-")));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	return root;
}

async function waitFor(check: () => boolean, label: string): Promise<void> {
	const deadline = Date.now() + 8_000;
	while (!check()) {
		if (Date.now() > deadline) throw new Error(`timed out: ${label}`);
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

async function attach(
	backend: NativeWatchBackend,
	root: string,
	ignore: string[],
) {
	const events: NativeWatchEvent[] = [];
	const errors: unknown[] = [];
	const subscription = await backend.subscribe({
		rootPath: root,
		ignore,
		generation: 1,
		onEvents: (batch) => events.push(...batch),
		onError: (error) => errors.push(error),
	});
	cleanups.push(() => subscription.unsubscribe());
	// FSEvents can replay the root's own creation just after attach.
	await new Promise((resolve) => setTimeout(resolve, 300));
	events.length = 0;
	const saw = (type: NativeWatchEvent["type"], target: string) =>
		events.some((event) => event.type === type && event.path === target);
	return { events, errors, saw };
}

for (const backend of [parcelWatchBackend, chokidarWatchBackend]) {
	describe(`${backend.name} watch backend`, () => {
		test("reports create, update and delete with absolute paths", async () => {
			const root = await makeRoot();
			const { saw, errors } = await attach(backend, root, []);
			const file = path.join(root, "a.txt");

			await writeFile(file, "one");
			await waitFor(() => saw("create", file), "create");
			await new Promise((resolve) => setTimeout(resolve, 150));
			await writeFile(file, "two, longer");
			await waitFor(() => saw("update", file), "update");
			await rm(file);
			await waitFor(() => saw("delete", file), "delete");
			expect(errors).toEqual([]);
		});

		// parcel's inotify backend loses both races below — its crawl rejects
		// when a directory vanishes mid-attach, and a directory created inside
		// a brand-new one is never scanned — which is why Linux does not use it.
		const losesInotifyRaces =
			backend === parcelWatchBackend && process.platform === "linux";

		test.skipIf(losesInotifyRaces)(
			"watches a directory created after attach",
			async () => {
				const root = await makeRoot();
				const { saw } = await attach(backend, root, []);
				const nested = path.join(root, "captures", "deep");
				await mkdir(nested, { recursive: true });
				await waitFor(() => saw("create", path.join(root, "captures")), "dir");
				await new Promise((resolve) => setTimeout(resolve, 200));
				const file = path.join(nested, "shot.png");
				await writeFile(file, "x");
				await waitFor(() => saw("create", file), "nested file");
			},
		);

		test("delivers nothing from an ignored subtree", async () => {
			const root = await makeRoot();
			await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
			await mkdir(path.join(root, "app", "[id]"), { recursive: true });
			const { events, saw } = await attach(backend, root, [
				"**/node_modules/**",
				"app/\\[id\\]/**",
			]);
			await writeFile(path.join(root, "node_modules", "pkg", "i.js"), "x");
			await writeFile(path.join(root, "app", "[id]", "page.tsx"), "x");
			const sentinel = path.join(root, "sentinel.txt");
			await writeFile(sentinel, "x");
			await waitFor(() => saw("create", sentinel), "sentinel");
			expect(
				events.filter(
					(event) =>
						event.path.includes("node_modules") || event.path.includes("[id]"),
				),
			).toEqual([]);
		});

		test.skipIf(losesInotifyRaces)(
			"stays attached while a subdirectory is created and deleted in a loop",
			async () => {
				const root = await makeRoot();
				let churning = true;
				const churn = (async () => {
					while (churning) {
						const dir = path.join(root, "captures");
						await mkdir(path.join(dir, "a", "b"), { recursive: true });
						await rm(dir, { recursive: true, force: true });
					}
				})();
				cleanups.push(async () => {
					churning = false;
					await churn;
				});

				for (let attempt = 0; attempt < 10; attempt += 1) {
					const subscription = await backend.subscribe({
						rootPath: root,
						ignore: [],
						generation: attempt + 1,
						onEvents: () => {},
						onError: () => {},
					});
					await subscription.unsubscribe();
				}
			},
			30_000,
		);
	});
}

describe("FsWatcherManager on the chokidar backend", () => {
	test("emits events, prunes ignored dirs, and recovers a recreated root", async () => {
		const parent = await makeRoot();
		const root = path.join(parent, "worktree");
		await mkdir(path.join(root, "node_modules"), { recursive: true });
		const manager = new FsWatcherManager({
			backend: chokidarWatchBackend,
			debounceMs: 20,
			recoveryPollMs: 100,
		});
		cleanups.push(() => manager.close());
		const seen: Array<{ kind: string; absolutePath: string }> = [];
		await manager.subscribe({ absolutePath: root }, (batch) => {
			seen.push(...batch.events);
		});
		const saw = (kind: string, target: string) =>
			seen.some((e) => e.kind === kind && e.absolutePath === target);

		await writeFile(path.join(root, "node_modules", "ignored.js"), "x");
		const file = path.join(root, "src.ts");
		await writeFile(file, "x");
		await waitFor(() => saw("create", file), "manager create");
		expect(seen.some((e) => e.absolutePath.includes("node_modules"))).toBe(
			false,
		);
		expect(manager.isPathPruned(root, file)).toBe(false);

		await rm(root, { recursive: true, force: true });
		await waitFor(() => saw("delete", root), "root delete");
		seen.length = 0;
		await mkdir(root, { recursive: true });
		await waitFor(() => saw("create", root), "root recreated");
		const after = path.join(root, "after.ts");
		await writeFile(after, "x");
		await waitFor(() => saw("create", after), "event after recovery");
	}, 30_000);
});

describe("createIgnoreMatcher", () => {
	const isIgnored = createIgnoreMatcher("/repo", [
		"**/node_modules/**",
		"packages/web/\\[id\\]/**",
		"*.tsbuildinfo",
		"vendor/cache",
	]);

	test("prunes a directory whose contents are ignored", () => {
		expect(isIgnored("/repo/node_modules", true)).toBe(true);
		expect(isIgnored("/repo/a/node_modules", undefined)).toBe(true);
		expect(isIgnored("/repo/a/node_modules/x/index.js", false)).toBe(true);
	});

	test("matches escaped glob magic literally", () => {
		expect(isIgnored("/repo/packages/web/[id]", true)).toBe(true);
		expect(isIgnored("/repo/packages/web/i", true)).toBe(false);
	});

	test("treats an entry without glob magic as a path under the root", () => {
		expect(isIgnored("/repo/vendor/cache", true)).toBe(true);
		expect(isIgnored("/repo/vendor/cache/a.bin", false)).toBe(true);
		expect(isIgnored("/repo/vendor/cached", true)).toBe(false);
	});

	test("never ignores the root or anything outside it", () => {
		expect(isIgnored("/repo", true)).toBe(false);
		expect(isIgnored("/repo/src/modules", true)).toBe(false);
		expect(isIgnored("/repo/tsconfig.tsbuildinfo", false)).toBe(true);
		expect(isIgnored("/elsewhere/node_modules/x", false)).toBe(false);
	});
});
