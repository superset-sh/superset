import { describe, expect, it } from "bun:test";
import type { Event as ParcelWatcherEvent } from "@parcel/watcher";
import type { WorkspaceFsWatchEvent } from "./types";
import {
	coalesceWatchEvents,
	extractWatcherErrorMessage,
	reconcileRenameEvents,
	WorkspaceFsWatcherManager,
} from "./watch";

function createEvent(
	type: ParcelWatcherEvent["type"],
	path: string,
): ParcelWatcherEvent {
	return { type, path };
}

describe("coalesceWatchEvents", () => {
	it("collapses repeated updates on the same path", () => {
		const events = coalesceWatchEvents([
			createEvent("update", "/workspace/src/file.ts"),
			createEvent("update", "/workspace/src/file.ts"),
			createEvent("update", "/workspace/src/file.ts"),
		]);

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual(createEvent("update", "/workspace/src/file.ts"));
	});

	it("preserves create when followed by update", () => {
		const events = coalesceWatchEvents([
			createEvent("create", "/workspace/src/file.ts"),
			createEvent("update", "/workspace/src/file.ts"),
		]);

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual(createEvent("create", "/workspace/src/file.ts"));
	});

	it("drops create-then-delete pairs in the same burst", () => {
		const events = coalesceWatchEvents([
			createEvent("create", "/workspace/src/file.ts"),
			createEvent("delete", "/workspace/src/file.ts"),
		]);

		expect(events).toHaveLength(0);
	});

	it("treats delete-then-create as one update", () => {
		const events = coalesceWatchEvents([
			createEvent("delete", "/workspace/src/file.ts"),
			createEvent("create", "/workspace/src/file.ts"),
		]);

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual(createEvent("update", "/workspace/src/file.ts"));
	});
});

function createWorkspaceEvent(
	event: WorkspaceFsWatchEvent,
): WorkspaceFsWatchEvent {
	return event;
}

describe("reconcileRenameEvents", () => {
	it("converts a same-parent delete/create pair into a rename", () => {
		const events = reconcileRenameEvents([
			createWorkspaceEvent({
				type: "delete",
				workspaceId: "ws",
				absolutePath: "/workspace/src/old.ts",
				isDirectory: false,
				revision: 1,
			}),
			createWorkspaceEvent({
				type: "create",
				workspaceId: "ws",
				absolutePath: "/workspace/src/new.ts",
				isDirectory: false,
				revision: 2,
			}),
		]);

		expect(events).toEqual([
			{
				type: "rename",
				workspaceId: "ws",
				oldAbsolutePath: "/workspace/src/old.ts",
				absolutePath: "/workspace/src/new.ts",
				isDirectory: false,
				revision: 2,
			},
		]);
	});

	it("converts a same-basename move pair into a rename", () => {
		const events = reconcileRenameEvents([
			createWorkspaceEvent({
				type: "delete",
				workspaceId: "ws",
				absolutePath: "/workspace/src/file.ts",
				isDirectory: false,
				revision: 1,
			}),
			createWorkspaceEvent({
				type: "create",
				workspaceId: "ws",
				absolutePath: "/workspace/lib/file.ts",
				isDirectory: false,
				revision: 2,
			}),
		]);

		expect(events[0]).toEqual({
			type: "rename",
			workspaceId: "ws",
			oldAbsolutePath: "/workspace/src/file.ts",
			absolutePath: "/workspace/lib/file.ts",
			isDirectory: false,
			revision: 2,
		});
	});

	it("leaves ambiguous churn as separate events", () => {
		const events = reconcileRenameEvents([
			createWorkspaceEvent({
				type: "delete",
				workspaceId: "ws",
				absolutePath: "/workspace/src/one.ts",
				isDirectory: false,
				revision: 1,
			}),
			createWorkspaceEvent({
				type: "delete",
				workspaceId: "ws",
				absolutePath: "/workspace/src/two.ts",
				isDirectory: false,
				revision: 2,
			}),
			createWorkspaceEvent({
				type: "create",
				workspaceId: "ws",
				absolutePath: "/workspace/src/three.ts",
				isDirectory: false,
				revision: 3,
			}),
			createWorkspaceEvent({
				type: "create",
				workspaceId: "ws",
				absolutePath: "/workspace/src/four.ts",
				isDirectory: false,
				revision: 4,
			}),
		]);

		expect(events).toHaveLength(4);
		expect(events.every((event) => event.type !== "rename")).toEqual(true);
	});
});

describe("WorkspaceFsWatcherManager.subscribe", () => {
	it("throws when watching a non-existent path", async () => {
		const manager = new WorkspaceFsWatcherManager();

		try {
			await expect(
				manager.subscribe(
					{
						workspaceId: "test-ws",
						rootPath: "/nonexistent/path/that/does/not/exist",
					},
					() => {},
				),
			).rejects.toThrow("Cannot watch non-existent path");
		} finally {
			await manager.close();
		}
	});
});

describe("extractWatcherErrorMessage", () => {
	it("extracts message from a standard Error", () => {
		const error = new Error("something broke");
		expect(extractWatcherErrorMessage(error)).toBe("something broke");
	});

	it("returns a string error as-is", () => {
		expect(extractWatcherErrorMessage("raw string error")).toBe(
			"raw string error",
		);
	});

	it("extracts message from an object with a message property", () => {
		const nativeError = { message: "Bad file descriptor", code: "EBADF" };
		expect(extractWatcherErrorMessage(nativeError)).toBe("Bad file descriptor");
	});

	it("handles native errors that serialize as empty objects", () => {
		const nativeError = Object.create(null);
		Object.defineProperty(nativeError, "message", {
			value: "Bad file descriptor",
			enumerable: false,
		});
		// JSON.stringify produces "{}" for this object
		expect(JSON.stringify(nativeError)).toBe("{}");
		// But our extractor gets the message
		expect(extractWatcherErrorMessage(nativeError)).toBe("Bad file descriptor");
	});

	it("falls back to String() for unknown error shapes", () => {
		expect(extractWatcherErrorMessage(42)).toBe("42");
		expect(extractWatcherErrorMessage(null)).toBe("null");
		expect(extractWatcherErrorMessage(undefined)).toBe("undefined");
	});
});
