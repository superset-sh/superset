import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import {
	collectWorktreeBatchPaths,
	DEBOUNCE_MS,
	filterGitIgnoredEvents,
	GIT_DIR_DEBOUNCE_MS,
	type GitChangedEvent,
	GitWatcher,
	MAX_WORKTREE_PATHS_PER_BATCH,
} from "./git-watcher";

interface GitWatcherInternals {
	handleGitDirEvent(workspaceId: string, filename: string | null): void;
	addWorktreePaths(workspaceId: string, paths: Iterable<string>): void;
	getOrCreateBatch(workspaceId: string): {
		hasGitDir: boolean;
		paths: Set<string> | null;
	};
	markWorktreeBroad(workspaceId: string): void;
	scheduleFlush(workspaceId: string): void;
	pendingBatches: Map<string, unknown>;
	debounceTimers: Map<string, unknown>;
}

function createWatcher(): GitWatcher {
	return new GitWatcher(
		{} as unknown as ConstructorParameters<typeof GitWatcher>[0],
		{} as unknown as ConstructorParameters<typeof GitWatcher>[1],
	);
}

function internals(watcher: GitWatcher): GitWatcherInternals {
	return watcher as unknown as GitWatcherInternals;
}

describe("filterGitIgnoredEvents edge cases", () => {
	const worktree = "/repo";
	const ignored = new Set(["dist", "apps/web/.next"]);

	test("a rename whose OLD path is a .gitignore flags a rule change", () => {
		const { events, sawGitignoreChange } = filterGitIgnoredEvents(
			[
				{
					kind: "rename",
					absolutePath: "/repo/src/ignore.bak",
					oldAbsolutePath: "/repo/src/.gitignore",
				},
			],
			worktree,
			ignored,
		);
		expect(sawGitignoreChange).toBe(true);
		expect(events).toHaveLength(1);
	});

	test("distant/.gitignore is not mistaken for dist/.gitignore", () => {
		const { events, sawGitignoreChange } = filterGitIgnoredEvents(
			[{ kind: "update", absolutePath: "/repo/distant/.gitignore" }],
			worktree,
			ignored,
		);
		expect(sawGitignoreChange).toBe(true);
		expect(events).toHaveLength(1);
	});

	test("moving a .gitignore into an ignored dir still flags (its old location un-ignores)", () => {
		const { sawGitignoreChange, events } = filterGitIgnoredEvents(
			[
				{
					kind: "rename",
					absolutePath: "/repo/dist/.gitignore",
					oldAbsolutePath: "/repo/src/.gitignore",
				},
			],
			worktree,
			ignored,
		);
		expect(sawGitignoreChange).toBe(true);
		expect(events).toHaveLength(1);
	});

	test("moving a .gitignore out of an ignored dir flags", () => {
		const { sawGitignoreChange } = filterGitIgnoredEvents(
			[
				{
					kind: "rename",
					absolutePath: "/repo/src/.gitignore",
					oldAbsolutePath: "/repo/dist/.gitignore",
				},
			],
			worktree,
			ignored,
		);
		expect(sawGitignoreChange).toBe(true);
	});

	test("files merely ending in gitignore do not flag", () => {
		const { sawGitignoreChange } = filterGitIgnoredEvents(
			[
				{ kind: "update", absolutePath: "/repo/x.gitignore" },
				{ kind: "update", absolutePath: "/repo/src/notgitignore" },
				{ kind: "update", absolutePath: "/repo/src/.gitignore.bak" },
			],
			worktree,
			ignored,
		);
		expect(sawGitignoreChange).toBe(false);
	});

	test("the worktree root's own .gitignore inside an ignored dir named like the root prefix", () => {
		// ignored dir "dist"; a path "/repo/dist" (the dir itself) with no slash.
		const { events } = filterGitIgnoredEvents(
			[{ kind: "delete", absolutePath: "/repo/dist" }],
			worktree,
			ignored,
		);
		expect(events).toEqual([]);
	});
});

describe("collectWorktreeBatchPaths bounds", () => {
	test("exactly the cap is returned in full; one over stops early", () => {
		const events = Array.from(
			{ length: MAX_WORKTREE_PATHS_PER_BATCH },
			(_, i) => ({ kind: "update" as const, absolutePath: `/repo/f${i}` }),
		);
		expect(collectWorktreeBatchPaths(events, "/repo").size).toBe(
			MAX_WORKTREE_PATHS_PER_BATCH,
		);
		const over = [
			...events,
			{ kind: "update" as const, absolutePath: "/repo/over" },
			{ kind: "update" as const, absolutePath: "/repo/never-reached" },
		];
		const paths = collectWorktreeBatchPaths(over, "/repo");
		expect(paths.size).toBe(MAX_WORKTREE_PATHS_PER_BATCH + 1);
		expect(paths.has("never-reached")).toBe(false);
	});

	test("a trailing-slash worktree path and the root itself produce no path", () => {
		const paths = collectWorktreeBatchPaths(
			[
				{ kind: "update", absolutePath: "/repo/" },
				{ kind: "update", absolutePath: "/repo" },
				{ kind: "update", absolutePath: "/repo/.git/index" },
				{ kind: "update", absolutePath: "/repository/x" },
			],
			"/repo",
		);
		expect([...paths]).toEqual([]);
	});
});

describe("GitWatcher batching bounds", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	test("exactly 128 paths stay scoped; 129 go broad", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((e) => events.push(e));
		const paths = Array.from(
			{ length: MAX_WORKTREE_PATHS_PER_BATCH },
			(_, i) => `f${i}`,
		);
		internals(watcher).addWorktreePaths("w", paths);
		jest.advanceTimersByTime(DEBOUNCE_MS);
		expect(events[0]?.paths).toHaveLength(MAX_WORKTREE_PATHS_PER_BATCH);

		internals(watcher).addWorktreePaths("w", [...paths, "one-more"]);
		jest.advanceTimersByTime(DEBOUNCE_MS);
		expect(events[1]).toEqual({ workspaceId: "w" });
	});

	test("two sub-cap batches in one window that together exceed the cap go broad", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((e) => events.push(e));
		internals(watcher).addWorktreePaths(
			"w",
			Array.from({ length: 100 }, (_, i) => `a${i}`),
		);
		jest.advanceTimersByTime(DEBOUNCE_MS - 1);
		internals(watcher).addWorktreePaths(
			"w",
			Array.from({ length: 100 }, (_, i) => `b${i}`),
		);
		jest.advanceTimersByTime(DEBOUNCE_MS);
		expect(events).toEqual([{ workspaceId: "w" }]);
	});

	test("a broad worktree batch followed by one .git event flushes on the short window", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((e) => events.push(e));
		internals(watcher).markWorktreeBroad("w");
		internals(watcher).handleGitDirEvent("w", "index");
		jest.advanceTimersByTime(DEBOUNCE_MS);
		expect(events).toEqual([{ workspaceId: "w" }]);
	});

	test("a broad worktree batch plus a steady .git event stream still flushes within the wide window", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((e) => events.push(e));
		internals(watcher).markWorktreeBroad("w");
		// A rebase/am touches .git/ every 200ms for a while.
		for (let t = 0; t < GIT_DIR_DEBOUNCE_MS * 3; t += 200) {
			internals(watcher).handleGitDirEvent("w", "HEAD");
			jest.advanceTimersByTime(200);
		}
		expect(events.length).toBeGreaterThanOrEqual(1);
	});

	test("the leading-anchored wide window is lost once paths is null", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((e) => events.push(e));
		internals(watcher).handleGitDirEvent("w", "index");
		internals(watcher).markWorktreeBroad("w");
		// Same steady stream, but starting from a .git/-only batch.
		for (let t = 0; t < GIT_DIR_DEBOUNCE_MS * 3; t += 200) {
			internals(watcher).handleGitDirEvent("w", "HEAD");
			jest.advanceTimersByTime(200);
		}
		expect(events.length).toBeGreaterThanOrEqual(1);
	});

	test("events raised from inside a listener land in a fresh batch and flush again", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		let reentered = false;
		watcher.onChanged((e) => {
			events.push(e);
			if (!reentered) {
				reentered = true;
				internals(watcher).addWorktreePaths("w", ["from-listener"]);
			}
		});
		internals(watcher).addWorktreePaths("w", ["first"]);
		jest.advanceTimersByTime(DEBOUNCE_MS);
		expect(events).toEqual([{ workspaceId: "w", paths: ["first"] }]);
		jest.advanceTimersByTime(DEBOUNCE_MS);
		expect(events[1]).toEqual({ workspaceId: "w", paths: ["from-listener"] });
	});

	test("close() with a pending batch never emits and leaves no timer", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((e) => events.push(e));
		internals(watcher).addWorktreePaths("w", ["x"]);
		watcher.close();
		jest.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS * 2);
		expect(events).toEqual([]);
		expect(internals(watcher).pendingBatches.size).toBe(0);
		expect(internals(watcher).debounceTimers.size).toBe(0);
	});

	test("unwatchWorkspace with a pending batch drops it", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((e) => events.push(e));
		internals(watcher).addWorktreePaths("w", ["x"]);
		watcher.unwatchWorkspace("w");
		jest.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS * 2);
		expect(events).toEqual([]);
	});

	test("a listener that throws does not stop a later listener or a later flush", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		const errors = jest.spyOn(console, "error").mockImplementation(() => {});
		watcher.onChanged(() => {
			throw new Error("bad subscriber");
		});
		watcher.onChanged((e) => events.push(e));
		internals(watcher).addWorktreePaths("w", ["x"]);
		jest.advanceTimersByTime(DEBOUNCE_MS);
		internals(watcher).addWorktreePaths("w", ["y"]);
		jest.advanceTimersByTime(DEBOUNCE_MS);
		errors.mockRestore();
		expect(events.map((e) => e.paths)).toEqual([["x"], ["y"]]);
	});

	test("an empty-string path never makes it into the batch, and NFD paths are passed through untouched", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((e) => events.push(e));
		const nfd = "café.txt";
		internals(watcher).addWorktreePaths("w", ["", nfd]);
		jest.advanceTimersByTime(DEBOUNCE_MS);
		expect(events).toEqual([{ workspaceId: "w", paths: [nfd] }]);
	});
});
