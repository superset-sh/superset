import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { GitDirectoryWatcher } from "./git-directory-watcher.ts";

const roots: string[] = [];
const watchers: GitDirectoryWatcher[] = [];
afterEach(async () => {
	for (const watcher of watchers.splice(0)) watcher.close();
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

test("worker reports readiness and nested git changes, then releases subscriptions", async () => {
	const root = await mkdtemp(join(tmpdir(), "git-directory-worker-"));
	roots.push(root);
	await mkdir(join(root, "refs"));
	const watcher = new GitDirectoryWatcher(() =>
		resolve(import.meta.dirname, "../workers/host-worker.ts"),
	);
	watchers.push(watcher);
	let ready!: () => void;
	let changed!: (filename: string) => void;
	const readiness = new Promise<void>((resolve) => {
		ready = resolve;
	});
	const change = new Promise<string>((resolve) => {
		changed = resolve;
	});
	const errors: boolean[] = [];
	const subscription = watcher.watch(
		root,
		(filename) => {
			if (filename === null) ready();
			else if (filename.includes("branch")) changed(filename);
		},
		() => errors.push(true),
	);
	await readiness;
	await writeFile(join(root, "refs", "branch"), "sha");
	expect(await change).toContain("branch");
	expect(errors).toEqual([]);
	subscription.close();
	subscription.close();
});

test("worker registration failure is reported without blocking the caller", async () => {
	const watcher = new GitDirectoryWatcher(() =>
		resolve(import.meta.dirname, "../workers/host-worker.ts"),
	);
	watchers.push(watcher);
	const root = await mkdtemp(join(tmpdir(), "git-directory-missing-"));
	roots.push(root);
	let failed!: () => void;
	const failure = new Promise<void>((resolve) => {
		failed = resolve;
	});
	const subscription = watcher.watch(join(root, "missing"), () => {}, failed);
	expect(subscription.close).toBeFunction();
	await failure;
	subscription.close();
});
