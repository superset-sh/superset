import { describe, expect, it } from "bun:test";
import type { Event as ParcelWatcherEvent } from "@parcel/watcher";
import type { InternalWatchEvent } from "./watch";
import { coalesceWatchEvents, reconcileRenameEvents } from "./watch";

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

function createInternalEvent(event: InternalWatchEvent): InternalWatchEvent {
	return event;
}

describe("reconcileRenameEvents", () => {
	it("converts a same-parent delete/create pair into a rename", () => {
		const events = reconcileRenameEvents([
			createInternalEvent({
				kind: "delete",
				absolutePath: "/workspace/src/old.ts",
				isDirectory: false,
			}),
			createInternalEvent({
				kind: "create",
				absolutePath: "/workspace/src/new.ts",
				isDirectory: false,
			}),
		]);

		expect(events).toEqual([
			{
				kind: "rename",
				oldAbsolutePath: "/workspace/src/old.ts",
				absolutePath: "/workspace/src/new.ts",
				isDirectory: false,
			},
		]);
	});

	it("converts a same-basename move pair into a rename", () => {
		const events = reconcileRenameEvents([
			createInternalEvent({
				kind: "delete",
				absolutePath: "/workspace/src/file.ts",
				isDirectory: false,
			}),
			createInternalEvent({
				kind: "create",
				absolutePath: "/workspace/lib/file.ts",
				isDirectory: false,
			}),
		]);

		expect(events[0]).toEqual({
			kind: "rename",
			oldAbsolutePath: "/workspace/src/file.ts",
			absolutePath: "/workspace/lib/file.ts",
			isDirectory: false,
		});
	});

	it("leaves ambiguous churn as separate events", () => {
		const events = reconcileRenameEvents([
			createInternalEvent({
				kind: "delete",
				absolutePath: "/workspace/src/one.ts",
				isDirectory: false,
			}),
			createInternalEvent({
				kind: "delete",
				absolutePath: "/workspace/src/two.ts",
				isDirectory: false,
			}),
			createInternalEvent({
				kind: "create",
				absolutePath: "/workspace/src/three.ts",
				isDirectory: false,
			}),
			createInternalEvent({
				kind: "create",
				absolutePath: "/workspace/src/four.ts",
				isDirectory: false,
			}),
		]);

		expect(events).toHaveLength(4);
		expect(events.every((event) => event.kind !== "rename")).toEqual(true);
	});
});
