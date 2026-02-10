import { beforeEach, describe, expect, it } from "bun:test";

// WorkspaceInitManager is a pure in-memory class — no mocks needed.
// We get the class constructor from the exported singleton to create fresh instances.
const mod = await import("./workspace-init-manager");
const WorkspaceInitManagerClass = Object.getPrototypeOf(
	mod.workspaceInitManager,
).constructor as new () => typeof mod.workspaceInitManager;

let manager: typeof mod.workspaceInitManager;

beforeEach(() => {
	manager = new WorkspaceInitManagerClass();
});

describe("WorkspaceInitManager", () => {
	describe("startJob + isInitializing", () => {
		it("returns true during init (pending step)", () => {
			manager.startJob("ws-1", "proj-1");
			expect(manager.isInitializing("ws-1")).toBe(true);
		});

		it("returns true during intermediate steps", () => {
			manager.startJob("ws-1", "proj-1");
			manager.updateProgress("ws-1", "creating_worktree", "Creating...");
			expect(manager.isInitializing("ws-1")).toBe(true);
		});

		it("returns false for unknown workspace", () => {
			expect(manager.isInitializing("ws-unknown")).toBe(false);
		});
	});

	describe("isInitializing false for ready/failed", () => {
		it("returns false after reaching ready step", () => {
			manager.startJob("ws-1", "proj-1");
			manager.updateProgress("ws-1", "ready", "Ready");
			expect(manager.isInitializing("ws-1")).toBe(false);
		});

		it("returns false after reaching failed step", () => {
			manager.startJob("ws-1", "proj-1");
			manager.updateProgress("ws-1", "failed", "Error", "some error");
			expect(manager.isInitializing("ws-1")).toBe(false);
		});
	});

	describe("hasFailed", () => {
		it("returns true when step is failed", () => {
			manager.startJob("ws-1", "proj-1");
			manager.updateProgress("ws-1", "failed", "Error");
			expect(manager.hasFailed("ws-1")).toBe(true);
		});

		it("returns false when step is not failed", () => {
			manager.startJob("ws-1", "proj-1");
			expect(manager.hasFailed("ws-1")).toBe(false);
		});
	});

	describe("cancel + isCancellationRequested", () => {
		it("sets durable cancellation flag", () => {
			manager.startJob("ws-1", "proj-1");
			expect(manager.isCancellationRequested("ws-1")).toBe(false);

			manager.cancel("ws-1");
			expect(manager.isCancellationRequested("ws-1")).toBe(true);
		});

		it("isCancellationRequested survives finalizeJob", () => {
			manager.startJob("ws-1", "proj-1");
			manager.cancel("ws-1");
			manager.finalizeJob("ws-1");

			// The cancellation flag persists even after finalize
			expect(manager.isCancellationRequested("ws-1")).toBe(true);
		});

		it("cancel works even without an active job", () => {
			// cancel adds to the durable Set even without a job
			manager.cancel("ws-1");
			expect(manager.isCancellationRequested("ws-1")).toBe(true);
		});
	});

	describe("clearJob", () => {
		it("clears cancellation flag", () => {
			manager.startJob("ws-1", "proj-1");
			manager.cancel("ws-1");
			expect(manager.isCancellationRequested("ws-1")).toBe(true);

			manager.clearJob("ws-1");
			expect(manager.isCancellationRequested("ws-1")).toBe(false);
		});

		it("clears job progress", () => {
			manager.startJob("ws-1", "proj-1");
			expect(manager.getProgress("ws-1")).toBeDefined();

			manager.clearJob("ws-1");
			expect(manager.getProgress("ws-1")).toBeUndefined();
		});
	});

	describe("waitForInit", () => {
		it("blocks until finalizeJob is called", async () => {
			manager.startJob("ws-1", "proj-1");

			let resolved = false;
			const waitPromise = manager.waitForInit("ws-1").then(() => {
				resolved = true;
			});

			// Give a tick — should still be blocked
			await new Promise((r) => setTimeout(r, 10));
			expect(resolved).toBe(false);

			// Finalize the job
			manager.finalizeJob("ws-1");

			await waitPromise;
			expect(resolved).toBe(true);
		});

		it("returns immediately when no job is in progress", async () => {
			// No startJob called — should return immediately
			const start = Date.now();
			await manager.waitForInit("ws-1");
			const elapsed = Date.now() - start;

			// Should be nearly instant (well under 100ms)
			expect(elapsed).toBeLessThan(100);
		});

		it("times out when finalizeJob is never called", async () => {
			manager.startJob("ws-1", "proj-1");

			const start = Date.now();
			await manager.waitForInit("ws-1", 200); // 200ms timeout
			const elapsed = Date.now() - start;

			// Should have waited ~200ms for the timeout
			expect(elapsed).toBeGreaterThanOrEqual(180);
			expect(elapsed).toBeLessThan(500);
		});

		it("returns immediately after job already finalized", async () => {
			manager.startJob("ws-1", "proj-1");
			manager.finalizeJob("ws-1");

			// Done promise was removed by finalizeJob, so this should return immediately
			const start = Date.now();
			await manager.waitForInit("ws-1");
			const elapsed = Date.now() - start;
			expect(elapsed).toBeLessThan(100);
		});
	});

	describe("acquireProjectLock / releaseProjectLock", () => {
		it("acquires and releases lock", async () => {
			expect(manager.hasProjectLock("proj-1")).toBe(false);

			await manager.acquireProjectLock("proj-1");
			expect(manager.hasProjectLock("proj-1")).toBe(true);

			manager.releaseProjectLock("proj-1");
			expect(manager.hasProjectLock("proj-1")).toBe(false);
		});

		it("serializes concurrent lock requests", async () => {
			const order: string[] = [];

			// First lock holder
			await manager.acquireProjectLock("proj-1");

			// Second lock request — will block until first is released
			const secondLock = manager.acquireProjectLock("proj-1").then(() => {
				order.push("second-acquired");
			});

			// Give a tick to ensure second is waiting
			await new Promise((r) => setTimeout(r, 10));
			expect(order).toEqual([]);

			// Release first lock
			order.push("first-released");
			manager.releaseProjectLock("proj-1");

			await secondLock;

			expect(order).toEqual(["first-released", "second-acquired"]);

			// Clean up
			manager.releaseProjectLock("proj-1");
		});

		it("releaseProjectLock no-ops for unheld lock", () => {
			// Should not throw
			manager.releaseProjectLock("proj-nonexistent");
		});
	});

	describe("getProgress / getAllProgress", () => {
		it("returns progress for active job", () => {
			manager.startJob("ws-1", "proj-1");
			const progress = manager.getProgress("ws-1");

			expect(progress).toBeDefined();
			expect(progress?.workspaceId).toBe("ws-1");
			expect(progress?.projectId).toBe("proj-1");
			expect(progress?.step).toBe("pending");
		});

		it("returns all progress entries", () => {
			manager.startJob("ws-1", "proj-1");
			manager.startJob("ws-2", "proj-2");

			const all = manager.getAllProgress();
			expect(all).toHaveLength(2);
		});

		it("returns undefined for unknown workspace", () => {
			expect(manager.getProgress("ws-unknown")).toBeUndefined();
		});
	});

	describe("markWorktreeCreated / wasWorktreeCreated", () => {
		it("tracks worktree creation for cleanup", () => {
			manager.startJob("ws-1", "proj-1");
			expect(manager.wasWorktreeCreated("ws-1")).toBe(false);

			manager.markWorktreeCreated("ws-1");
			expect(manager.wasWorktreeCreated("ws-1")).toBe(true);
		});

		it("returns false for unknown workspace", () => {
			expect(manager.wasWorktreeCreated("ws-unknown")).toBe(false);
		});
	});

	describe("event emission", () => {
		it("emits progress events on startJob", () => {
			const events: unknown[] = [];
			manager.on("progress", (p: unknown) => events.push(p));

			manager.startJob("ws-1", "proj-1");
			expect(events).toHaveLength(1);
		});

		it("emits progress events on updateProgress", () => {
			const events: unknown[] = [];
			manager.on("progress", (p: unknown) => events.push(p));

			manager.startJob("ws-1", "proj-1");
			manager.updateProgress("ws-1", "creating_worktree", "Creating...");

			expect(events).toHaveLength(2); // startJob + updateProgress
		});
	});
});
