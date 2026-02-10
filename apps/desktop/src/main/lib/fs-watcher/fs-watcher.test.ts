import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { FileSystemBatchEvent } from "shared/file-tree-types";

// --- Mock state ---

let subscribeCalls: Array<{
	rootPath: string;
	options: unknown;
	callback: (
		err: Error | null,
		events: Array<{ type: string; path: string }>,
	) => void;
}> = [];
let unsubscribeCalls: string[] = [];

function createMockSubscription(id: string) {
	return {
		unsubscribe: async () => {
			unsubscribeCalls.push(id);
		},
	};
}

let subscribeCallCount = 0;

mock.module("@parcel/watcher", () => ({
	subscribe: async (
		rootPath: string,
		callback: (
			err: Error | null,
			events: Array<{ type: string; path: string }>,
		) => void,
		options: unknown,
	) => {
		const id = `sub-${subscribeCallCount++}`;
		subscribeCalls.push({ rootPath, options, callback });
		return createMockSubscription(id);
	},
}));

// Dynamic import AFTER mocks are installed
const fsWatcherMod = await import("./fs-watcher");

// Get the class constructor from the singleton for fresh instances per test
const FsWatcherClass = Object.getPrototypeOf(fsWatcherMod.fsWatcher)
	.constructor as new () => typeof fsWatcherMod.fsWatcher;

let fsWatcher: typeof fsWatcherMod.fsWatcher;

beforeEach(() => {
	subscribeCalls = [];
	unsubscribeCalls = [];
	subscribeCallCount = 0;
	fsWatcher = new FsWatcherClass();
});

afterEach(async () => {
	await fsWatcher.stop();
});

describe("FsWatcher", () => {
	describe("switchTo()", () => {
		it("creates a subscription with rootPath and ignore dirs", async () => {
			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});

			expect(subscribeCalls).toHaveLength(1);
			expect(subscribeCalls[0].rootPath).toBe("/tmp/project");
			expect(subscribeCalls[0].options).toEqual({
				ignore: [
					"node_modules",
					".git",
					"dist",
					"build",
					".next",
					".turbo",
					"coverage",
				],
			});
		});

		it("no-ops when switching to the same workspace", async () => {
			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});
			expect(subscribeCalls).toHaveLength(1);

			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});
			// Should NOT create a second subscription
			expect(subscribeCalls).toHaveLength(1);
			expect(unsubscribeCalls).toHaveLength(0);
		});

		it("stops old watcher when switching to a different workspace", async () => {
			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/old",
			});
			expect(subscribeCalls).toHaveLength(1);
			expect(unsubscribeCalls).toHaveLength(0);

			await fsWatcher.switchTo({
				workspaceId: "ws-2",
				rootPath: "/tmp/new",
			});
			expect(subscribeCalls).toHaveLength(2);
			// Old subscription should have been unsubscribed
			expect(unsubscribeCalls).toHaveLength(1);
			expect(subscribeCalls[1].rootPath).toBe("/tmp/new");
		});

		it("emits 'switched' event with new workspace ID", async () => {
			const switchedIds: string[] = [];
			fsWatcher.on("switched", (id: string) => {
				switchedIds.push(id);
			});

			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});

			expect(switchedIds).toEqual(["ws-1"]);
		});
	});

	describe("unwatch()", () => {
		it("stops the active watcher if ID matches", async () => {
			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});
			expect(fsWatcher.getRootPath("ws-1")).toBe("/tmp/project");

			await fsWatcher.unwatch("ws-1");
			expect(unsubscribeCalls).toHaveLength(1);
			expect(fsWatcher.getRootPath("ws-1")).toBeUndefined();
		});

		it("no-ops for non-active workspace id", async () => {
			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});

			await fsWatcher.unwatch("ws-other");
			expect(unsubscribeCalls).toHaveLength(0);
			// ws-1 is still active
			expect(fsWatcher.getRootPath("ws-1")).toBe("/tmp/project");
		});

		it("no-ops when no watcher is active", async () => {
			await fsWatcher.unwatch("nonexistent");
			expect(unsubscribeCalls).toHaveLength(0);
		});
	});

	describe("stop()", () => {
		it("stops the active watcher", async () => {
			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/a",
			});

			await fsWatcher.stop();

			expect(unsubscribeCalls).toHaveLength(1);
			expect(fsWatcher.getRootPath("ws-1")).toBeUndefined();
			expect(fsWatcher.getActiveWorkspaceId()).toBeUndefined();
		});

		it("no-ops when no watcher is active", async () => {
			await fsWatcher.stop();
			expect(unsubscribeCalls).toHaveLength(0);
		});
	});

	describe("getRootPath()", () => {
		it("returns stored path for active workspace", async () => {
			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});
			expect(fsWatcher.getRootPath("ws-1")).toBe("/tmp/project");
		});

		it("returns undefined for non-active workspace", async () => {
			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});
			expect(fsWatcher.getRootPath("ws-other")).toBeUndefined();
		});

		it("returns undefined when no watcher is active", () => {
			expect(fsWatcher.getRootPath("ws-unknown")).toBeUndefined();
		});
	});

	describe("getActiveWorkspaceId()", () => {
		it("returns the active workspace ID", async () => {
			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});
			expect(fsWatcher.getActiveWorkspaceId()).toBe("ws-1");
		});

		it("returns undefined when no watcher is active", () => {
			expect(fsWatcher.getActiveWorkspaceId()).toBeUndefined();
		});
	});

	describe("event batching", () => {
		function triggerEvents(events: Array<{ type: string; path: string }>) {
			// Get the most recent subscribe callback
			const lastCall = subscribeCalls[subscribeCalls.length - 1];
			lastCall.callback(null, events);
		}

		it("batches events within debounce window into a single batch", async () => {
			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});

			const batches: FileSystemBatchEvent[] = [];
			fsWatcher.on("batch", (batch: FileSystemBatchEvent) => {
				batches.push(batch);
			});

			// Fire 3 events rapidly (well within 100ms debounce)
			triggerEvents([{ type: "create", path: "/tmp/project/a.ts" }]);
			triggerEvents([{ type: "update", path: "/tmp/project/b.ts" }]);
			triggerEvents([{ type: "delete", path: "/tmp/project/c.ts" }]);

			// No batch yet (still within debounce window)
			expect(batches).toHaveLength(0);

			// Wait for debounce to fire (100ms + buffer)
			await new Promise((r) => setTimeout(r, 150));

			expect(batches).toHaveLength(1);
			expect(batches[0].events).toHaveLength(3);
			expect(batches[0].workspaceId).toBe("ws-1");
		});

		it("resets debounce timer on new events", async () => {
			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});

			const batches: FileSystemBatchEvent[] = [];
			fsWatcher.on("batch", (batch: FileSystemBatchEvent) => {
				batches.push(batch);
			});

			triggerEvents([{ type: "create", path: "/tmp/project/a.ts" }]);

			// Wait 50ms (less than 100ms debounce), then fire another
			await new Promise((r) => setTimeout(r, 50));
			triggerEvents([{ type: "update", path: "/tmp/project/b.ts" }]);

			// Wait another 50ms — still haven't hit 100ms since last event
			await new Promise((r) => setTimeout(r, 50));
			expect(batches).toHaveLength(0);

			// Wait for debounce to complete (100ms since last event)
			await new Promise((r) => setTimeout(r, 80));
			expect(batches).toHaveLength(1);
			expect(batches[0].events).toHaveLength(2);
		});

		it("forces flush at max batch window regardless of new events", async () => {
			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});

			const batches: FileSystemBatchEvent[] = [];
			fsWatcher.on("batch", (batch: FileSystemBatchEvent) => {
				batches.push(batch);
			});

			// Continuously trigger events every 80ms to keep resetting debounce
			// The max window (2s) should force a flush
			const interval = setInterval(() => {
				triggerEvents([
					{ type: "update", path: `/tmp/project/file-${Date.now()}.ts` },
				]);
			}, 80);

			// Wait for max window to fire (~2s + buffer)
			await new Promise((r) => setTimeout(r, 2200));
			clearInterval(interval);

			// At least one batch should have been emitted by the max window timer
			expect(batches.length).toBeGreaterThanOrEqual(1);
		});

		it("deduplicates by path with last write wins", async () => {
			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});

			const batches: FileSystemBatchEvent[] = [];
			fsWatcher.on("batch", (batch: FileSystemBatchEvent) => {
				batches.push(batch);
			});

			// Same file: first create, then update
			triggerEvents([{ type: "create", path: "/tmp/project/file.ts" }]);
			triggerEvents([{ type: "update", path: "/tmp/project/file.ts" }]);

			await new Promise((r) => setTimeout(r, 150));

			expect(batches).toHaveLength(1);
			// Only 1 event for that path (last write wins)
			expect(batches[0].events).toHaveLength(1);
			expect(batches[0].events[0].type).toBe("change"); // "update" maps to "change"
		});

		it("emits correct batch event shape", async () => {
			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});

			const batches: FileSystemBatchEvent[] = [];
			fsWatcher.on("batch", (batch: FileSystemBatchEvent) => {
				batches.push(batch);
			});

			triggerEvents([{ type: "create", path: "/tmp/project/src/file.ts" }]);

			await new Promise((r) => setTimeout(r, 150));

			expect(batches).toHaveLength(1);
			const batch = batches[0];
			expect(batch.workspaceId).toBe("ws-1");
			expect(typeof batch.timestamp).toBe("number");
			expect(batch.events[0]).toEqual({
				type: "add", // "create" maps to "add"
				path: "/tmp/project/src/file.ts",
				relativePath: "src/file.ts",
			});
		});

		it("clears pending events after flush", async () => {
			await fsWatcher.switchTo({
				workspaceId: "ws-1",
				rootPath: "/tmp/project",
			});

			const batches: FileSystemBatchEvent[] = [];
			fsWatcher.on("batch", (batch: FileSystemBatchEvent) => {
				batches.push(batch);
			});

			triggerEvents([{ type: "create", path: "/tmp/project/a.ts" }]);

			// Wait for flush
			await new Promise((r) => setTimeout(r, 150));
			expect(batches).toHaveLength(1);

			// Wait more — no additional batches should appear (events cleared)
			await new Promise((r) => setTimeout(r, 200));
			expect(batches).toHaveLength(1);
		});
	});
});
