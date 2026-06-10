import { describe, expect, test } from "bun:test";
import { Terminal as HeadlessTerminal } from "@xterm/headless";
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

	test("flattens alternate screen snapshots into normal scrollback for observers", () => {
		const tracker = createReplaySnapshotTracker(20, 4);
		const replayTarget = new HeadlessTerminal({
			cols: 20,
			rows: 4,
			scrollback: 5000,
			allowProposedApi: true,
		});
		const targetWriteBuffer = (
			replayTarget as unknown as {
				_core?: {
					_writeBuffer?: { writeSync(data: string | Uint8Array): void };
				};
			}
		)._core?._writeBuffer;
		if (!targetWriteBuffer) {
			throw new Error("expected headless target write buffer");
		}

		try {
			for (let i = 1; i <= 12; i++) {
				tracker.feed(encoder.encode(`normal-${i}\r\n`));
			}
			tracker.feed(encoder.encode("\x1b[?1049h"));
			for (let i = 1; i <= 8; i++) {
				tracker.feed(encoder.encode(`alt-${i}\r\n`));
			}

			const snapshot = tracker.serialize();
			const text = decoder.decode(snapshot ?? new Uint8Array());
			expect(text).not.toContain("\x1b[?1049h");

			targetWriteBuffer.writeSync(snapshot ?? new Uint8Array());

			expect(replayTarget.buffer.active.type).toBe("normal");
			expect(replayTarget.buffer.active.baseY).toBeGreaterThan(0);

			const lines: string[] = [];
			for (let i = 0; i < replayTarget.buffer.active.length; i++) {
				lines.push(
					replayTarget.buffer.active.getLine(i)?.translateToString(true) ?? "",
				);
			}

			expect(lines).toContain("normal-1");
			expect(lines).toContain("normal-12");
			expect(lines).toContain("alt-8");
		} finally {
			tracker.dispose();
			replayTarget.dispose();
		}
	});
});
