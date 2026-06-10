import { describe, expect, test } from "bun:test";
import { createReplaySnapshotTracker } from "./terminal-replay-snapshot";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe("createReplaySnapshotTracker", () => {
	test("serializes scrollback for late terminal observers", () => {
		const tracker = createReplaySnapshotTracker(12, 3);
		try {
			tracker.feed(encoder.encode("line-1\r\n"));
			tracker.feed(encoder.encode("line-2\r\n"));
			tracker.feed(encoder.encode("line-3\r\n"));
			tracker.feed(encoder.encode("line-4\r\n"));
			tracker.feed(encoder.encode("line-5"));

			const snapshot = tracker.serialize();
			expect(snapshot).not.toBeNull();
			const text = decoder.decode(snapshot ?? new Uint8Array());

			expect(text).toContain("line-1");
			expect(text).toContain("line-5");
		} finally {
			tracker.dispose();
		}
	});

	test("continues tracking after terminal resize", () => {
		const tracker = createReplaySnapshotTracker(10, 2);
		try {
			tracker.feed(encoder.encode("before\r\n"));
			tracker.resize(20, 4);
			tracker.feed(encoder.encode("after"));

			const snapshot = tracker.serialize();
			const text = decoder.decode(snapshot ?? new Uint8Array());

			expect(text).toContain("before");
			expect(text).toContain("after");
		} finally {
			tracker.dispose();
		}
	});
});
