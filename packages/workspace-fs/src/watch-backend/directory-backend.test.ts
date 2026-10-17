import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	realpath,
	rename,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { directoryWatchBackend } from "./directory-backend";
import type { NativeWatchEvent } from "./types";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function makeRoot(): Promise<string> {
	const root = await realpath(await mkdtemp(path.join(tmpdir(), "dwb-")));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	return root;
}

async function waitFor(check: () => boolean, label: string): Promise<void> {
	const deadline = Date.now() + 3_000;
	while (!check()) {
		if (Date.now() > deadline) throw new Error(`timed out: ${label}`);
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

// Bun's fs.watch (unlike Node's) drops an event for a name that follows
// another for the same name within a few milliseconds.
function outsideBunMergeWindow(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 20));
}

function inotifyWatchCount(): number {
	let count = 0;
	for (const fd of readdirSync("/proc/self/fdinfo")) {
		try {
			const info = readFileSync(`/proc/self/fdinfo/${fd}`, "utf8");
			count += info.split("\n").filter((l) => l.startsWith("inotify")).length;
		} catch {}
	}
	return count;
}

async function attach(root: string, ignore: string[] = []) {
	const events: NativeWatchEvent[] = [];
	const subscription = await directoryWatchBackend.subscribe({
		rootPath: root,
		ignore,
		generation: 1,
		onEvents: (batch) => events.push(...batch),
		onError: (error) => {
			throw error;
		},
	});
	cleanups.push(() => subscription.unsubscribe());
	const saw = (type: NativeWatchEvent["type"], target: string) =>
		events.some((event) => event.type === type && event.path === target);
	// Events are reconciled in order, so once a later write is seen every
	// event for earlier operations has been delivered.
	let sentinels = 0;
	const settle = async () => {
		const sentinel = path.join(root, `sentinel-${sentinels++}`);
		await writeFile(sentinel, "x");
		await waitFor(() => saw("create", sentinel), sentinel);
	};
	return { events, saw, settle };
}

describe.skipIf(process.platform !== "linux")("directory watch backend", () => {
	test("watches directories only", async () => {
		const root = await makeRoot();
		await mkdir(path.join(root, "a", "b"), { recursive: true });
		for (let i = 0; i < 20; i++) {
			await writeFile(path.join(root, "a", `f${i}`), "x");
		}
		const before = inotifyWatchCount();
		await attach(root);
		expect(inotifyWatchCount() - before).toBe(3);
	});

	test("reports the contents of a directory moved away as deleted", async () => {
		const root = await makeRoot();
		const outside = await makeRoot();
		await mkdir(path.join(root, "d", "e"), { recursive: true });
		await writeFile(path.join(root, "d", "e", "f"), "x");
		const { events, saw, settle } = await attach(root);

		await rename(path.join(root, "d"), path.join(outside, "d"));
		await waitFor(() => saw("delete", path.join(root, "d", "e", "f")), "f");
		expect(saw("delete", path.join(root, "d", "e"))).toBe(true);
		expect(saw("delete", path.join(root, "d"))).toBe(true);

		events.length = 0;
		await writeFile(path.join(outside, "d", "e", "f"), "y");
		await settle();
		expect(events.filter((e) => !e.path.includes("sentinel"))).toEqual([]);
	});

	test("keeps watching a directory moved within the tree", async () => {
		const root = await makeRoot();
		await mkdir(path.join(root, "d", "e"), { recursive: true });
		const { saw } = await attach(root);

		await rename(path.join(root, "d"), path.join(root, "m"));
		await waitFor(() => saw("create", path.join(root, "m", "e")), "moved");
		const file = path.join(root, "m", "e", "f");
		await writeFile(file, "x");
		await waitFor(() => saw("create", file), "write after move");
	});

	test("watches a directory replaced at the same path", async () => {
		const root = await makeRoot();
		await mkdir(path.join(root, "d"));
		await mkdir(path.join(root, "replacement"));
		const { saw } = await attach(root);

		await rename(path.join(root, "replacement"), path.join(root, "d"));
		const file = path.join(root, "d", "f");
		await writeFile(file, "x");
		await waitFor(() => saw("create", file), "create in replacement");
		await writeFile(file, "longer");
		await waitFor(() => saw("update", file), "update in replacement");
	});

	test("follows a file replaced by a directory and back", async () => {
		const root = await makeRoot();
		const entry = path.join(root, "x");
		await writeFile(entry, "x");
		const { saw, events } = await attach(root);

		await rm(entry);
		await waitFor(() => saw("delete", entry), "file gone");
		await outsideBunMergeWindow();
		await mkdir(entry);
		await writeFile(path.join(entry, "inner"), "x");
		await waitFor(() => saw("create", path.join(entry, "inner")), "inner");

		events.length = 0;
		await rm(entry, { recursive: true });
		await waitFor(() => saw("delete", path.join(entry, "inner")), "inner gone");
		await outsideBunMergeWindow();
		await writeFile(entry, "file again");
		await waitFor(() => saw("create", entry), "file again");
		await writeFile(entry, "updated");
		await waitFor(() => saw("update", entry), "file updated");
	});

	test("does not follow symlinks to directories", async () => {
		const root = await makeRoot();
		const outside = await makeRoot();
		const link = path.join(root, "link");
		const { saw, events, settle } = await attach(root);

		await symlink(outside, link);
		await waitFor(() => saw("create", link), "link");
		await writeFile(path.join(outside, "f"), "x");
		await settle();
		expect(events.some((e) => e.path.startsWith(`${link}/`))).toBe(false);
	});

	test("reports a child named like its directory", async () => {
		const root = await makeRoot();
		const file = path.join(root, "cache", "cache");
		await mkdir(path.dirname(file));
		await writeFile(file, "x");
		const { saw } = await attach(root);

		await writeFile(file, "longer");
		await waitFor(() => saw("update", file), "update");
		await rm(file);
		await waitFor(() => saw("delete", file), "delete");
	});

	test("an attach aborted mid-crawl rejects and leaves nothing watched", async () => {
		const root = await makeRoot();
		for (let i = 0; i < 200; i++) {
			await mkdir(path.join(root, `d${i}`, "e"), { recursive: true });
		}
		const before = inotifyWatchCount();
		const controller = new AbortController();
		const attaching = directoryWatchBackend.subscribe({
			rootPath: root,
			ignore: [],
			generation: 1,
			signal: controller.signal,
			onEvents: () => {},
			onError: () => {},
		});
		let settled = false;
		attaching.then(
			(subscription) => {
				settled = true;
				cleanups.push(() => subscription.unsubscribe());
			},
			() => (settled = true),
		);
		while (!settled && inotifyWatchCount() - before < 5) {
			await new Promise((resolve) => setImmediate(resolve));
		}
		expect(settled).toBe(false);
		controller.abort();
		await expect(attaching).rejects.toThrow();
		expect(inotifyWatchCount()).toBe(before);
	});
});
