import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import {
	DEBOUNCE_MS,
	GIT_DIR_DEBOUNCE_MS,
	type GitChangedEvent,
	GitWatcher,
	isStatusRelevantGitDirEvent,
} from "./git-watcher";

/**
 * The dispatch seams the `.git/` watcher callback and the worktree fs stream
 * feed into. Driving them directly lets us assert emit/debounce behavior
 * without spinning a real `fs.watch` over a scratch repo.
 */
interface GitWatcherInternals {
	handleGitDirEvent(workspaceId: string, filename: string | null): void;
	addWorktreePaths(workspaceId: string, paths: Iterable<string>): void;
	getOrCreateBatch(workspaceId: string): unknown;
	scheduleFlush(workspaceId: string): void;
}

function createWatcher(): GitWatcher {
	// `start()` is never called, so the dispatch methods under test never touch
	// the db or filesystem — empty stand-ins are enough.
	return new GitWatcher(
		{} as unknown as ConstructorParameters<typeof GitWatcher>[0],
		{} as unknown as ConstructorParameters<typeof GitWatcher>[1],
	);
}

function internals(watcher: GitWatcher): GitWatcherInternals {
	return watcher as unknown as GitWatcherInternals;
}

describe("isStatusRelevantGitDirEvent", () => {
	test("ignores `.git/` paths whose churn can't change `git status`", () => {
		const ignored = [
			"objects",
			"objects/ab/cdef0123456789",
			"objects/pack/pack-abc.pack",
			"objects/pack/pack-abc.idx",
			"lfs",
			"lfs/objects/aa/bb/ccdd",
			"logs",
			"logs/HEAD",
			"logs/refs/heads/main",
			"FETCH_HEAD",
		];
		for (const path of ignored) {
			expect(isStatusRelevantGitDirEvent(path)).toBe(false);
		}
	});

	test("keeps status-relevant `.git/` paths", () => {
		const relevant = [
			"HEAD",
			"index",
			"refs/heads/main",
			"refs/remotes/origin/main",
			"packed-refs",
			"MERGE_HEAD",
			"ORIG_HEAD",
			"config",
		];
		for (const path of relevant) {
			expect(isStatusRelevantGitDirEvent(path)).toBe(true);
		}
	});

	test("fails open when the watcher can't say what changed", () => {
		expect(isStatusRelevantGitDirEvent(null)).toBe(true);
		expect(isStatusRelevantGitDirEvent(undefined)).toBe(true);
		expect(isStatusRelevantGitDirEvent("")).toBe(true);
	});

	test("does not confuse a top-level file that merely starts with an ignored name", () => {
		expect(isStatusRelevantGitDirEvent("objects-are-cool")).toBe(true);
		expect(isStatusRelevantGitDirEvent("logspam")).toBe(true);
	});
});

describe("GitWatcher .git event filtering", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	test("ignored `.git/` events never emit, even past the widest window", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((event) => events.push(event));

		for (const path of [
			"objects/ab/cdef",
			"objects/pack/pack-x.pack",
			"lfs/objects/aa/bb",
			"logs/HEAD",
			"FETCH_HEAD",
		]) {
			internals(watcher).handleGitDirEvent("workspace-1", path);
		}

		jest.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS + DEBOUNCE_MS);
		expect(events).toEqual([]);
	});

	test("status-relevant `.git/` events emit a broad change signal", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((event) => events.push(event));

		internals(watcher).handleGitDirEvent("workspace-1", "index");
		jest.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS);

		expect(events).toEqual([{ workspaceId: "workspace-1" }]);
	});
});

describe("GitWatcher adaptive debounce", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	test("a `.git/`-only batch waits the wide window", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((event) => events.push(event));

		internals(watcher).handleGitDirEvent("workspace-1", "index");

		// Still pending after the short (worktree) window.
		jest.advanceTimersByTime(DEBOUNCE_MS);
		expect(events).toEqual([]);

		// Flushes once the wide window elapses.
		jest.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS - DEBOUNCE_MS);
		expect(events).toEqual([{ workspaceId: "workspace-1" }]);
	});

	test("a worktree-path batch flushes on the short window", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((event) => events.push(event));

		internals(watcher).addWorktreePaths("workspace-1", ["src/app.ts"]);

		jest.advanceTimersByTime(DEBOUNCE_MS);
		expect(events).toEqual([
			{ workspaceId: "workspace-1", paths: ["src/app.ts"] },
		]);
	});

	test("a worktree edit joining a `.git/` batch restores the short window", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((event) => events.push(event));

		// Starts as `.git/`-only (wide window)...
		internals(watcher).handleGitDirEvent("workspace-1", "index");
		// ...then a user edit joins, which should shorten the window.
		internals(watcher).addWorktreePaths("workspace-1", ["src/app.ts"]);

		jest.advanceTimersByTime(DEBOUNCE_MS);
		// Broad signal (no `paths`) because the batch saw `.git/` activity.
		expect(events).toEqual([{ workspaceId: "workspace-1" }]);
	});

	test("rapid `.git/`-only events ride the first wide window instead of resetting it", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((event) => events.push(event));

		// First `.git/` event arms the wide window at t=0.
		internals(watcher).handleGitDirEvent("workspace-1", "index");
		jest.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS - DEBOUNCE_MS);

		// A later `.git/`-only event must NOT push the flush out, or a rapid
		// metadata sequence (rebase, `git am`) would keep resetting the clock.
		internals(watcher).handleGitDirEvent("workspace-1", "HEAD");
		expect(events).toEqual([]);

		// The window armed by the first event still elapses on schedule.
		jest.advanceTimersByTime(DEBOUNCE_MS);
		expect(events).toEqual([{ workspaceId: "workspace-1" }]);
	});

	test("a batch with neither `.git/` activity nor worktree paths uses the short window", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((event) => events.push(event));

		// Mirrors the worktree-fs branch that fires with no decodable paths:
		// the wide `.git/`-only window must not leak to it.
		internals(watcher).getOrCreateBatch("workspace-1");
		internals(watcher).scheduleFlush("workspace-1");

		jest.advanceTimersByTime(DEBOUNCE_MS);
		expect(events).toEqual([{ workspaceId: "workspace-1" }]);
	});
});
