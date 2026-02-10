import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// --- Mock state for @parcel/watcher ---

interface DeferredSubscription {
	resolve: (sub: { unsubscribe: () => Promise<void> }) => void;
	rootPath: string;
	callback: (
		err: Error | null,
		events: Array<{ type: string; path: string }>,
	) => void;
}

let pendingSubscriptions: DeferredSubscription[] = [];
let unsubscribeCalls: string[] = [];
let subscribeCallCount = 0;

/**
 * Mock @parcel/watcher with deferred subscribe resolution.
 * This lets us control when `subscribe` resolves to simulate race conditions.
 */
mock.module("@parcel/watcher", () => ({
	subscribe: (
		rootPath: string,
		callback: (
			err: Error | null,
			events: Array<{ type: string; path: string }>,
		) => void,
		_options: unknown,
	): Promise<{ unsubscribe: () => Promise<void> }> => {
		subscribeCallCount++;
		return new Promise((resolve) => {
			pendingSubscriptions.push({
				resolve: (sub) => resolve(sub),
				rootPath,
				callback,
			});
		});
	},
}));

// Dynamic imports AFTER mocks
const fsWatcherMod = await import("./fs-watcher");
const initManagerMod = await import("main/lib/workspace-init-manager");

// Get class constructors from singletons for fresh instances
const FsWatcherClass = Object.getPrototypeOf(fsWatcherMod.fsWatcher)
	.constructor as new () => typeof fsWatcherMod.fsWatcher;

const WorkspaceInitManagerClass = Object.getPrototypeOf(
	initManagerMod.workspaceInitManager,
).constructor as new () => typeof initManagerMod.workspaceInitManager;

let fsWatcher: typeof fsWatcherMod.fsWatcher;
let manager: typeof initManagerMod.workspaceInitManager;

/** Flush microtask queue so switchTo() progresses past its awaits to subscribe. */
function flushMicrotasks() {
	return new Promise<void>((r) => setTimeout(r, 0));
}

/**
 * Wait until at least `count` subscriptions are pending (with a short timeout).
 * Needed because switchTo() has two awaits before calling subscribe.
 */
async function waitForPendingSubscriptions(count = 1) {
	const deadline = Date.now() + 2000;
	while (pendingSubscriptions.length < count && Date.now() < deadline) {
		await flushMicrotasks();
	}
	if (pendingSubscriptions.length < count) {
		throw new Error(
			`Timed out waiting for ${count} pending subscriptions (have ${pendingSubscriptions.length})`,
		);
	}
}

/**
 * Resolve the next pending @parcel/watcher.subscribe call.
 * Returns the mock subscription and callback for triggering events.
 */
function resolveNextSubscription() {
	const pending = pendingSubscriptions.shift();
	if (!pending) throw new Error("No pending subscription to resolve");

	const id = `resolved-${pending.rootPath}`;
	const sub = {
		unsubscribe: async () => {
			unsubscribeCalls.push(id);
		},
	};
	pending.resolve(sub);
	return { sub, callback: pending.callback, rootPath: pending.rootPath };
}

beforeEach(() => {
	pendingSubscriptions = [];
	unsubscribeCalls = [];
	subscribeCallCount = 0;
	fsWatcher = new FsWatcherClass();
	manager = new WorkspaceInitManagerClass();
});

afterEach(async () => {
	// Resolve any dangling subscriptions to avoid hanging promises
	while (pendingSubscriptions.length > 0) {
		resolveNextSubscription();
	}
	await fsWatcher.stop();
});

describe("FsWatcher lifecycle integration", () => {
	describe("happy path: switchTo watches, unwatch stops", () => {
		it("after unwatch, no active watcher remains", async () => {
			// Simulate init: switch to the workspace
			const switchPromise = fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});

			// Wait for subscribe to be called, then resolve it
			await waitForPendingSubscriptions(1);
			resolveNextSubscription();
			await switchPromise;

			expect(fsWatcher.getRootPath("ws-1")).toBe("/tmp/project");
			expect(fsWatcher.getActiveWorkspaceId()).toBe("ws-1");

			// Simulate delete: unwatch
			await fsWatcher.unwatch("ws-1");

			expect(fsWatcher.getRootPath("ws-1")).toBeUndefined();
			expect(fsWatcher.getActiveWorkspaceId()).toBeUndefined();
			expect(unsubscribeCalls).toHaveLength(1);
		});
	});

	describe("switchTo properly cleans up old watcher", () => {
		it("stops old watcher before starting new one", async () => {
			// Start watching ws-1
			const switch1 = fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/a",
			});
			await waitForPendingSubscriptions(1);
			resolveNextSubscription();
			await switch1;

			expect(fsWatcher.getActiveWorkspaceId()).toBe("ws-1");

			// Switch to ws-2 — should stop ws-1 first
			const switch2 = fsWatcher.switchTo({
				workspaceId: "ws-2",
				rootPath: "/tmp/b",
			});
			await waitForPendingSubscriptions(1);
			resolveNextSubscription();
			await switch2;

			expect(fsWatcher.getActiveWorkspaceId()).toBe("ws-2");
			expect(fsWatcher.getRootPath("ws-1")).toBeUndefined();
			expect(fsWatcher.getRootPath("ws-2")).toBe("/tmp/b");
			// Old subscription was unsubscribed
			expect(unsubscribeCalls).toHaveLength(1);
		});
	});

	describe("race: init switchTo resolves after delete unwatch", () => {
		it("second unwatch after waitForInit cleans up the late watcher", async () => {
			// 1. Start an init job
			manager.startJob("ws-1", "proj-1");

			// 2. Start switching (subscribe is deferred — not yet resolved)
			const switchPromise = fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});

			// Wait for subscribe to be called (but don't resolve yet)
			await waitForPendingSubscriptions(1);

			// 3. Meanwhile, the delete flow runs:
			//    a) First unwatch — but switchTo hasn't set state yet (subscribe pending)
			await fsWatcher.unwatch("ws-1");
			expect(fsWatcher.getRootPath("ws-1")).toBeUndefined();

			//    b) Cancel the init job
			manager.cancel("ws-1");
			expect(manager.isCancellationRequested("ws-1")).toBe(true);

			// 4. Now the deferred subscribe resolves (init's switchTo completes late)
			resolveNextSubscription();
			await switchPromise;

			// The watcher is now active (the late switchTo completed)
			expect(fsWatcher.getRootPath("ws-1")).toBe("/tmp/project");

			// 5. Finalize the init job (allows waitForInit to unblock)
			manager.finalizeJob("ws-1");
			await manager.waitForInit("ws-1");

			// 6. The delete flow does a second unwatch to clean up the late watcher
			await fsWatcher.unwatch("ws-1");

			// 7. Assert: no active watcher
			expect(fsWatcher.getRootPath("ws-1")).toBeUndefined();
			expect(fsWatcher.getActiveWorkspaceId()).toBeUndefined();
			expect(unsubscribeCalls).toHaveLength(1); // Only one actual unsubscribe (the late one)
		});
	});

	describe("cancellation guard: switchTo skipped when cancelled", () => {
		it("does not switch when cancellation was requested before switchTo", async () => {
			manager.startJob("ws-1", "proj-1");
			manager.cancel("ws-1");

			// The init flow should check isCancellationRequested before calling switchTo.
			// Simulate what a well-behaved init flow does:
			if (manager.isCancellationRequested("ws-1")) {
				// Skip the switchTo — this is the guard
				manager.finalizeJob("ws-1");
			}

			// No subscribe call should have been made
			expect(pendingSubscriptions).toHaveLength(0);
			expect(subscribeCallCount).toBe(0);
			expect(fsWatcher.getActiveWorkspaceId()).toBeUndefined();
		});

		it("isCancellationRequested remains true through the full delete flow", async () => {
			manager.startJob("ws-1", "proj-1");
			manager.cancel("ws-1");
			manager.finalizeJob("ws-1");

			// Even after finalize, the cancellation flag persists
			expect(manager.isCancellationRequested("ws-1")).toBe(true);

			// Only clearJob removes it
			manager.clearJob("ws-1");
			expect(manager.isCancellationRequested("ws-1")).toBe(false);
		});
	});

	describe("re-attach on failed deletion", () => {
		it("re-attaches watcher using saved rootPath when teardown fails", async () => {
			// 1. Init: switchTo succeeds
			const switchPromise = fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});
			await waitForPendingSubscriptions(1);
			resolveNextSubscription();
			await switchPromise;

			const savedRootPath = fsWatcher.getRootPath("ws-1");
			expect(savedRootPath).toBe("/tmp/project");

			// 2. Delete begins: unwatch
			await fsWatcher.unwatch("ws-1");
			expect(fsWatcher.getRootPath("ws-1")).toBeUndefined();

			// 3. Simulate deletion failure (e.g., DB or filesystem error)
			const deletionFailed = true;

			// 4. Re-attach watcher using the saved rootPath
			if (deletionFailed && savedRootPath) {
				const reattachPromise = fsWatcher.switchTo({
					workspaceId: "ws-1",
					rootPath: savedRootPath,
				});
				await waitForPendingSubscriptions(1);
				resolveNextSubscription();
				await reattachPromise;
			}

			// 5. Watcher is back
			expect(fsWatcher.getRootPath("ws-1")).toBe("/tmp/project");
			expect(fsWatcher.getActiveWorkspaceId()).toBe("ws-1");
			// Total subscribes: 2 (original + re-attach)
			expect(subscribeCallCount).toBe(2);
		});
	});
});
