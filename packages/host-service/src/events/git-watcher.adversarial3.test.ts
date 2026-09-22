import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import type { FsWatchEvent } from "@superset/workspace-fs/host";
import { DEBOUNCE_MS, type GitChangedEvent, GitWatcher } from "./git-watcher";

/**
 * Drives the real worktree stream loop (`startWorktreeWatch`) with a fake
 * filesystem service, so the batches reach the store the way they do in
 * production — through `filterGitIgnoredEvents` and
 * `collectWorktreeBatchPaths` — rather than through the `addWorktreePaths`
 * seam the earlier rounds used.
 */
interface GitWatcherInternals {
	startWorktreeWatch(workspaceId: string, worktreePath: string): () => void;
}

class FakeStream {
	private readonly queue: Array<{ events: FsWatchEvent[] }> = [];
	private waiter:
		| ((value: IteratorResult<{ events: FsWatchEvent[] }>) => void)
		| null = null;
	private done = false;

	push(events: FsWatchEvent[]): void {
		const item = { events };
		if (this.waiter) {
			const resolve = this.waiter;
			this.waiter = null;
			resolve({ value: item, done: false });
		} else {
			this.queue.push(item);
		}
	}

	[Symbol.asyncIterator](): AsyncIterator<{ events: FsWatchEvent[] }> {
		return {
			next: () => {
				const item = this.queue.shift();
				if (item) return Promise.resolve({ value: item, done: false });
				if (this.done) return Promise.resolve({ value: undefined, done: true });
				return new Promise((resolve) => {
					this.waiter = resolve;
				});
			},
			return: () => {
				this.done = true;
				this.waiter?.({ value: undefined, done: true });
				this.waiter = null;
				return Promise.resolve({ value: undefined, done: true });
			},
		};
	}
}

const WORKTREE = "/repo";
const WS = "ws-overflow";

function createWatcher(stream: FakeStream): GitWatcher {
	const filesystem = {
		getServiceForWorkspace: () => ({
			watchPath: () => stream,
		}),
	};
	return new GitWatcher(
		{} as unknown as ConstructorParameters<typeof GitWatcher>[0],
		filesystem as unknown as ConstructorParameters<typeof GitWatcher>[1],
	);
}

async function settle(): Promise<void> {
	// Let the stream loop pick up every pushed batch before the clock moves.
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("round 3: overflow and root-level events through the real stream loop", () => {
	let watcher: GitWatcher;
	let stream: FakeStream;
	let dispose: () => void;
	const emitted: GitChangedEvent[] = [];

	beforeEach(() => {
		jest.useFakeTimers();
		emitted.length = 0;
		stream = new FakeStream();
		watcher = createWatcher(stream);
		watcher.onChanged((event) => emitted.push(event));
		dispose = (watcher as unknown as GitWatcherInternals).startWorktreeWatch(
			WS,
			WORKTREE,
		);
	});

	afterEach(() => {
		dispose();
		watcher.close();
		jest.useRealTimers();
	});

	test("an overflow batch arriving alone is broad", async () => {
		stream.push([
			{ kind: "overflow", absolutePath: WORKTREE, isDirectory: true },
		]);
		await settle();
		jest.advanceTimersByTime(DEBOUNCE_MS + 1);
		expect(emitted).toEqual([{ workspaceId: WS }]);
	});

	test("an overflow batch landing in a window that already has scoped paths must widen it to broad", async () => {
		// A burst is what causes the kernel to drop events, so the overflow
		// signal almost always shares a debounce window with surviving paths.
		stream.push([{ kind: "update", absolutePath: `${WORKTREE}/src/a.ts` }]);
		await settle();
		stream.push([
			{ kind: "overflow", absolutePath: WORKTREE, isDirectory: true },
		]);
		await settle();
		stream.push([{ kind: "update", absolutePath: `${WORKTREE}/src/b.ts` }]);
		await settle();
		jest.advanceTimersByTime(DEBOUNCE_MS + 1);

		expect(emitted).toHaveLength(1);
		// The dropped events could be for any path: a scoped emit here leaves
		// the status cache stale for everything the kernel discarded.
		expect(emitted[0]?.paths).toBeUndefined();
	});

	test("a synthetic root-level create (root recovery) in a window with scoped paths must widen it to broad", async () => {
		stream.push([{ kind: "update", absolutePath: `${WORKTREE}/src/a.ts` }]);
		await settle();
		stream.push([
			{ kind: "create", absolutePath: WORKTREE, isDirectory: true },
		]);
		await settle();
		jest.advanceTimersByTime(DEBOUNCE_MS + 1);

		expect(emitted).toHaveLength(1);
		expect(emitted[0]?.paths).toBeUndefined();
	});
});
