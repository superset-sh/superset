import type { Event as ParcelWatcherEvent } from "@parcel/watcher";
import { describe, expect, it } from "bun:test";
import { coalesceWatchEvents } from "./watch";

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
