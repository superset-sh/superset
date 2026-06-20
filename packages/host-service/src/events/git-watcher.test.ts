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
		}
	>;
	debounceTimers: Map<string, ReturnType<typeof setTimeout>>;
	pendingBatches: Map<string, { hasGitDir: boolean; paths: Set<string> }>;
};

describe("GitWatcher.removeWorkspace", () => {
	test("closes removed workspace watchers and clears pending debounce state", () => {
		const watcher = new GitWatcher({} as never, {} as never);
		const internals = watcher as unknown as GitWatcherInternals;
		const closeRemoved = mock(() => {});
		const disposeRemoved = mock(() => {});
		const closeActive = mock(() => {});
		const disposeActive = mock(() => {});
		const timer = setTimeout(() => {}, 60_000);

		try {
			internals.watched.set("deleted-workspace", {
				workspaceId: "deleted-workspace",
				worktreePath: "/tmp/deleted",
				gitDir: "/tmp/deleted/.git",
				watcher: { close: closeRemoved },
				disposeWorktreeWatch: disposeRemoved,
			});
			internals.watched.set("active-workspace", {
				workspaceId: "active-workspace",
				worktreePath: "/tmp/active",
				gitDir: "/tmp/active/.git",
				watcher: { close: closeActive },
				disposeWorktreeWatch: disposeActive,
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

			watcher.removeWorkspace("deleted-workspace");
			expect(closeRemoved).toHaveBeenCalledTimes(1);
			expect(disposeRemoved).toHaveBeenCalledTimes(1);
		} finally {
			clearTimeout(timer);
			watcher.close();
		}
	});
});
