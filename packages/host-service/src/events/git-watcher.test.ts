import { describe, expect, mock, test } from "bun:test";
import { GitWatcher } from "./git-watcher";

type GitWatcherInternals = {
	watched: Map<
		string,
		{
			workspaceId: string;
			worktreePath: string;
			gitDir: string;
			watcher: { close: () => void };
			disposeWorktreeWatch: () => void;
			disposed: boolean;
		}
	>;
	debounceTimers: Map<string, ReturnType<typeof setTimeout>>;
	pendingBatches: Map<string, { hasGitDir: boolean; paths: Set<string> }>;
	handleWatcherError: (
		workspaceId: string,
		entry: {
			workspaceId: string;
			worktreePath: string;
			gitDir: string;
			watcher: { close: () => void };
			disposeWorktreeWatch: () => void;
			disposed: boolean;
		},
	) => void;
};

describe("GitWatcher.removeWorkspace", () => {
	test("closes removed workspace watchers and clears pending debounce state", async () => {
		const watcher = new GitWatcher({} as never, {} as never);
		const internals = watcher as unknown as GitWatcherInternals;
		const closeRemoved = mock(() => {});
		const disposeRemoved = mock(() => {});
		const closeActive = mock(() => {});
		const disposeActive = mock(() => {});
		const timerFired = mock(() => {});
		const timer = setTimeout(timerFired, 10);

		try {
			internals.watched.set("deleted-workspace", {
				workspaceId: "deleted-workspace",
				worktreePath: "/tmp/deleted",
				gitDir: "/tmp/deleted/.git",
				watcher: { close: closeRemoved },
				disposeWorktreeWatch: disposeRemoved,
				disposed: false,
			});
			internals.watched.set("active-workspace", {
				workspaceId: "active-workspace",
				worktreePath: "/tmp/active",
				gitDir: "/tmp/active/.git",
				watcher: { close: closeActive },
				disposeWorktreeWatch: disposeActive,
				disposed: false,
			});
			internals.debounceTimers.set("deleted-workspace", timer);
			internals.pendingBatches.set("deleted-workspace", {
				hasGitDir: true,
				paths: new Set(["src/index.ts"]),
			});

			watcher.removeWorkspace("deleted-workspace");

			expect(closeRemoved).toHaveBeenCalledTimes(1);
			expect(disposeRemoved).toHaveBeenCalledTimes(1);
			expect(internals.watched.has("deleted-workspace")).toBe(false);
			expect(internals.debounceTimers.has("deleted-workspace")).toBe(false);
			expect(internals.pendingBatches.has("deleted-workspace")).toBe(false);
			expect(internals.watched.has("active-workspace")).toBe(true);
			expect(closeActive).not.toHaveBeenCalled();
			expect(disposeActive).not.toHaveBeenCalled();

			await new Promise((resolve) => setTimeout(resolve, 25));
			expect(timerFired).not.toHaveBeenCalled();

			watcher.removeWorkspace("deleted-workspace");
			expect(closeRemoved).toHaveBeenCalledTimes(1);
			expect(disposeRemoved).toHaveBeenCalledTimes(1);
		} finally {
			clearTimeout(timer);
			watcher.close();
		}
	});

	test("cleans up watcher errors before workspace registration", () => {
		const watcher = new GitWatcher({} as never, {} as never);
		const internals = watcher as unknown as GitWatcherInternals;
		const close = mock(() => {});
		const dispose = mock(() => {});
		const timer = setTimeout(() => {}, 10_000);
		const entry = {
			workspaceId: "early-error-workspace",
			worktreePath: "/tmp/early-error",
			gitDir: "/tmp/early-error/.git",
			watcher: { close },
			disposeWorktreeWatch: dispose,
			disposed: false,
		};

		try {
			internals.debounceTimers.set("early-error-workspace", timer);
			internals.pendingBatches.set("early-error-workspace", {
				hasGitDir: true,
				paths: new Set(["package.json"]),
			});

			internals.handleWatcherError("early-error-workspace", entry);

			expect(entry.disposed).toBe(true);
			expect(close).toHaveBeenCalledTimes(1);
			expect(dispose).toHaveBeenCalledTimes(1);
			expect(internals.watched.has("early-error-workspace")).toBe(false);
			expect(internals.debounceTimers.has("early-error-workspace")).toBe(false);
			expect(internals.pendingBatches.has("early-error-workspace")).toBe(false);

			internals.handleWatcherError("early-error-workspace", entry);
			expect(close).toHaveBeenCalledTimes(1);
			expect(dispose).toHaveBeenCalledTimes(1);
		} finally {
			clearTimeout(timer);
			watcher.close();
		}
	});
});
