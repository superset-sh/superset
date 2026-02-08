import { describe, expect, it } from "bun:test";
import {
	flushSession,
	getSerializedScrollback,
	recoverScrollback,
} from "./session";
import type { ScrollbackBuffer, TerminalSession } from "./types";

function createTestScrollbackBuffer(): ScrollbackBuffer {
	let chunks: string[] = [];
	let _totalLength = 0;

	return {
		write(data: string) {
			chunks.push(data);
			_totalLength += data.length;
		},
		getContent(): string {
			return chunks.join("");
		},
		clear() {
			chunks = [];
			_totalLength = 0;
		},
		dispose() {
			chunks = [];
			_totalLength = 0;
		},
	};
}

describe("session", () => {
	describe("recoverScrollback", () => {
		it("should write existing scrollback to buffer and return true", () => {
			const scrollbackBuffer = createTestScrollbackBuffer();

			const wasRecovered = recoverScrollback({
				existingScrollback: "existing content",
				scrollbackBuffer,
			});

			expect(wasRecovered).toBe(true);

			const content = scrollbackBuffer.getContent();
			expect(content).toContain("existing content");
		});

		it("should return false when no existing scrollback", () => {
			const scrollbackBuffer = createTestScrollbackBuffer();

			const wasRecovered = recoverScrollback({
				existingScrollback: null,
				scrollbackBuffer,
			});

			expect(wasRecovered).toBe(false);
		});
	});

	describe("getSerializedScrollback", () => {
		it("should return content from scrollback buffer", () => {
			const scrollbackBuffer = createTestScrollbackBuffer();
			scrollbackBuffer.write("test output");

			const mockSession = {
				scrollbackBuffer,
			} as unknown as TerminalSession;

			const result = getSerializedScrollback(mockSession);
			expect(result).toContain("test output");
		});
	});

	describe("flushSession", () => {
		it("should dispose data batcher and scrollback buffer", () => {
			let batcherDisposed = false;
			let bufferDisposed = false;

			const mockDataBatcher = {
				dispose: () => {
					batcherDisposed = true;
				},
			};

			const mockScrollbackBuffer = {
				dispose: () => {
					bufferDisposed = true;
				},
			};

			const mockSession = {
				dataBatcher: mockDataBatcher,
				scrollbackBuffer: mockScrollbackBuffer,
			} as unknown as TerminalSession;

			flushSession(mockSession);

			expect(batcherDisposed).toBe(true);
			expect(bufferDisposed).toBe(true);
		});
	});
});
