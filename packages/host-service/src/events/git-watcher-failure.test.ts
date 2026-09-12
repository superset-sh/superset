import { afterEach, expect, test } from "bun:test";
import type { FSWatcher } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FsWatchEvent } from "@superset/workspace-fs/host";
import simpleGit from "simple-git";
import { GitStatusStore } from "../trpc/router/git/utils/git-status-store/git-status-store";
import { GitWatcher } from "./git-watcher";

type Batch = { events: FsWatchEvent[] };
class Stream implements AsyncIterable<Batch>, AsyncIterator<Batch> {
	resolve: (result: IteratorResult<Batch>) => void = () => {};
	reject: (error: Error) => void = () => {};
	closed = false;
	[Symbol.asyncIterator]() {
		return this;
	}
	next(): Promise<IteratorResult<Batch>> {
		return new Promise((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
	async return(): Promise<IteratorResult<Batch>> {
		this.closed = true;
		this.resolve({ done: true, value: undefined });
		return { done: true, value: undefined };
	}
}
interface Internals {
	watched: Map<string, { watcher: FSWatcher }>;
	pendingBatches: Map<string, unknown>;
	interest: Map<string, number>;
	rescan(): Promise<void>;
}
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function waitFor(check: () => boolean) {
	const deadline = Date.now() + 5_000;
	while (!check()) {
		if (Date.now() > deadline) throw new Error("watch state did not settle");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}
for (const failure of ["reject", "end", "subscribe", "git"] as const) {
	test(`${failure} failure drops cached status and permits rescan to replace both watchers`, async () => {
		const repo = await mkdtemp(join(tmpdir(), "git-watch-failure-"));
		await simpleGit(repo).init();
		const workspaceId = "watch-failure";
		const row = { id: workspaceId, worktreePath: repo };
		const db = {
			select: () => ({
				from: () => ({ where: () => ({ get: () => row, all: () => [row] }) }),
			}),
		};
		const streams: Stream[] = [];
		let failSubscribe = failure === "subscribe";
		const filesystem = {
			getServiceForWorkspace: () => ({
				watchPath: () => {
					if (failSubscribe) throw new Error("subscription failed");
					const stream = new Stream();
					streams.push(stream);
					return stream;
				},
			}),
			refreshWatcherIgnores: async () => false,
		};
		const store = new GitStatusStore();
		const states: boolean[] = [];
		const watcher = new GitWatcher(
			db as unknown as ConstructorParameters<typeof GitWatcher>[0],
			filesystem as unknown as ConstructorParameters<typeof GitWatcher>[1],
			(id, watched) => {
				states.push(watched);
				if (watched) store.attach(id);
				else store.drop(id);
			},
		);
		cleanups.push(async () => {
			watcher.close();
			await rm(repo, { recursive: true, force: true });
		});
		const internals = watcher as unknown as Internals;
		let computations = 0;
		const read = () =>
			store.read({
				workspaceId,
				baseBranch: null,
				computeFull: async () => {
					computations++;
					return {
						currentBranch: null as never,
						defaultBranch: null as never,
						staged: [],
						unstaged: [],
						againstBase: [],
						ignoredPaths: [],
					};
				},
				computePartial: async () => {
					throw new Error("unexpected partial");
				},
			});
		watcher.watchWorkspace(workspaceId);
		await waitFor(() => states.includes(true));
		const oldWatcher = internals.watched.get(workspaceId)?.watcher;
		if (failure !== "subscribe") {
			await read();
			await read();
			expect(computations).toBe(1);
			if (failure === "reject") streams[0]?.reject(new Error("stream failed"));
			if (failure === "end")
				streams[0]?.resolve({ done: true, value: undefined });
			if (failure === "git")
				oldWatcher?.emit("error", new Error("native watcher failed"));
		}
		await waitFor(() => states.includes(false));
		expect(internals.watched.size).toBe(0);
		expect(internals.pendingBatches.size).toBe(0);
		expect(internals.interest.get(workspaceId)).toBe(1);
		if (failure !== "subscribe") expect(streams[0]?.closed).toBe(true);
		const before = computations;
		await read();
		await read();
		expect(computations).toBe(before + 2);

		failSubscribe = false;
		await internals.rescan();
		expect(internals.watched.has(workspaceId)).toBe(true);
		// A late error on the replaced watcher must not drop its replacement.
		oldWatcher?.emit("error", new Error("late old watcher error"));
		expect(internals.watched.has(workspaceId)).toBe(true);
		expect(states.at(-1)).toBe(true);
		const reattached = computations;
		await read();
		await read();
		expect(computations).toBe(reattached + 1);
	}, 15_000);
}
