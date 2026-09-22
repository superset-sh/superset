import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import {
	DEBOUNCE_MS,
	GIT_DIR_DEBOUNCE_MS,
	type GitChangedEvent,
	GitWatcher,
} from "./git-watcher";

interface GitWatcherInternals {
	handleGitDirEvent(workspaceId: string, filename: string | null): void;
	addWorktreePaths(workspaceId: string, paths: Iterable<string>): void;
	markWorktreeBroad(workspaceId: string): void;
	scheduleFlush(workspaceId: string): void;
	refreshIgnoredDirs(
		workspaceId: string,
		worktreePath: string,
		force?: boolean,
	): void;
	pendingBatches: Map<string, { deadline: ReturnType<typeof setTimeout> }>;
	debounceTimers: Map<string, unknown>;
	watched: Map<string, unknown>;
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

function expectIdle(watcher: GitWatcher) {
	expect(internals(watcher).pendingBatches.size).toBe(0);
	expect(internals(watcher).debounceTimers.size).toBe(0);
}

describe("round 2: flush deadline", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	test("a steady worktree stream every 100 ms for 5 s flushes at least every ~1 s, each scoped", () => {
		const watcher = createWatcher();
		const events: Array<{ at: number; event: GitChangedEvent }> = [];
		let now = 0;
		watcher.onChanged((event) => events.push({ at: now, event }));
		for (let i = 0; i < 50; i++) {
			internals(watcher).addWorktreePaths("w", [`f${i}`]);
			jest.advanceTimersByTime(100);
			now += 100;
		}
		expect(events.length).toBeGreaterThanOrEqual(4);
		let last = 0;
		for (const { at, event } of events) {
			expect(at - last).toBeLessThanOrEqual(GIT_DIR_DEBOUNCE_MS + 100);
			expect(event.paths).toBeDefined();
			last = at;
		}
		// Every path was delivered exactly once across the flushes.
		const delivered = events.flatMap(({ event }) => event.paths ?? []);
		jest.advanceTimersByTime(DEBOUNCE_MS);
		const tail = events.flatMap(({ event }) => event.paths ?? []);
		expect(new Set(tail).size).toBe(50);
		expect(tail.length).toBe(50);
		expect(delivered.length).toBeLessThanOrEqual(50);
		expectIdle(watcher);
	});

	test("the deadline firing while a debounce timer is armed emits once and leaves no timer", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((e) => events.push(e));
		internals(watcher).addWorktreePaths("w", ["a"]);
		jest.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS - 100);
		expect(events).toHaveLength(1);
		// Re-arm a short window that would fire after the (already cleared) deadline.
		internals(watcher).addWorktreePaths("w", ["b"]);
		jest.advanceTimersByTime(DEBOUNCE_MS - 1);
		expect(events).toHaveLength(1);
		jest.advanceTimersByTime(1);
		expect(events).toHaveLength(2);
		expect(events[1]).toEqual({ workspaceId: "w", paths: ["b"] });
		jest.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS * 3);
		expect(events).toHaveLength(2);
		expectIdle(watcher);
	});

	test("a debounce that keeps resetting until the deadline: exactly one emit at the deadline, nothing at the trailing edge", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((e) => events.push(e));
		// Events at 0, 250, 500, 750 keep the 300 ms trailing window from closing.
		for (let t = 0; t < GIT_DIR_DEBOUNCE_MS; t += 250) {
			internals(watcher).addWorktreePaths("w", [`p${t}`]);
			jest.advanceTimersByTime(249);
			expect(events).toHaveLength(0);
			jest.advanceTimersByTime(1);
		}
		expect(events).toHaveLength(1);
		expect(events[0]?.paths).toEqual(["p0", "p250", "p500", "p750"]);
		jest.advanceTimersByTime(DEBOUNCE_MS * 2);
		expect(events).toHaveLength(1);
		expectIdle(watcher);
	});

	test("events raised inside a listener during a deadline flush start a fresh batch with its own deadline", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		let reentered = false;
		watcher.onChanged((e) => {
			events.push(e);
			if (!reentered) {
				reentered = true;
				internals(watcher).handleGitDirEvent("w", "index");
			}
		});
		// Hold the trailing window open so the hard deadline is what flushes.
		for (let t = 0; t < GIT_DIR_DEBOUNCE_MS; t += 200) {
			internals(watcher).addWorktreePaths("w", ["x"]);
			jest.advanceTimersByTime(200);
		}
		expect(events).toHaveLength(1);
		expect(events[0]).toEqual({ workspaceId: "w", paths: ["x"] });
		expect(internals(watcher).pendingBatches.size).toBe(1);
		jest.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS - 1);
		expect(events).toHaveLength(1);
		jest.advanceTimersByTime(1);
		expect(events).toHaveLength(2);
		expect(events[1]).toEqual({ workspaceId: "w" });
		expectIdle(watcher);
	});

	test("close() with only the deadline left armed never emits", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((e) => events.push(e));
		internals(watcher).handleGitDirEvent("w", "HEAD");
		jest.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS - 1);
		watcher.close();
		jest.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS * 5);
		expect(events).toEqual([]);
		expectIdle(watcher);
		// Post-close dispatch must not resurrect a batch that outlives close.
		internals(watcher).addWorktreePaths("w", ["late"]);
		jest.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS * 2);
		expect(internals(watcher).pendingBatches.size).toBe(0);
		expect(events).toEqual([]);
	});

	test("unwatch then re-watch with a pending batch: the old batch is dropped and the new one flushes once", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((e) => events.push(e));
		const errors = jest.spyOn(console, "error").mockImplementation(() => {});
		watcher.watchWorkspace("w");
		internals(watcher).addWorktreePaths("w", ["old"]);
		jest.advanceTimersByTime(100);
		watcher.unwatchWorkspace("w");
		watcher.watchWorkspace("w");
		internals(watcher).addWorktreePaths("w", ["new"]);
		jest.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS * 2);
		errors.mockRestore();
		expect(events).toEqual([{ workspaceId: "w", paths: ["new"] }]);
		expectIdle(watcher);
	});

	test(".git/-only stream: leading-anchored, flushes at exactly the wide window and again one window later", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((e) => events.push(e));
		for (let t = 0; t < GIT_DIR_DEBOUNCE_MS * 2; t += 200) {
			internals(watcher).handleGitDirEvent("w", "refs/heads/main");
			if (t + 200 === GIT_DIR_DEBOUNCE_MS) {
				jest.advanceTimersByTime(199);
				expect(events).toHaveLength(0);
				jest.advanceTimersByTime(1);
				expect(events).toHaveLength(1);
			} else {
				jest.advanceTimersByTime(200);
			}
		}
		expect(events).toHaveLength(2);
		expect(events).toEqual([{ workspaceId: "w" }, { workspaceId: "w" }]);
		expectIdle(watcher);
	});

	test("refreshIgnoredDirs runs after a deadline flush, not only after a trailing flush", () => {
		const watcher = createWatcher();
		internals(watcher).watched.set("w", {
			workspaceId: "w",
			worktreePath: "/nowhere",
		});
		const refresh = jest
			.spyOn(
				watcher as unknown as {
					refreshIgnoredDirs: (
						workspaceId: string,
						worktreePath: string,
						force?: boolean,
					) => void;
				},
				"refreshIgnoredDirs",
			)
			.mockImplementation(() => {});
		for (let t = 0; t < GIT_DIR_DEBOUNCE_MS; t += 200) {
			internals(watcher).addWorktreePaths("w", ["x"]);
			jest.advanceTimersByTime(200);
		}
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(refresh.mock.calls[0]?.slice(0, 2)).toEqual(["w", "/nowhere"]);
		refresh.mockRestore();
	});

	test("two workspaces interleaved never share a batch or a deadline", () => {
		const watcher = createWatcher();
		const events: GitChangedEvent[] = [];
		watcher.onChanged((e) => events.push(e));
		internals(watcher).addWorktreePaths("a", ["a1"]);
		jest.advanceTimersByTime(100);
		internals(watcher).handleGitDirEvent("b", "index");
		jest.advanceTimersByTime(DEBOUNCE_MS - 100);
		expect(events).toEqual([{ workspaceId: "a", paths: ["a1"] }]);
		watcher.unwatchWorkspace("a");
		jest.advanceTimersByTime(GIT_DIR_DEBOUNCE_MS);
		expect(events).toEqual([
			{ workspaceId: "a", paths: ["a1"] },
			{ workspaceId: "b" },
		]);
		expectIdle(watcher);
	});
});
