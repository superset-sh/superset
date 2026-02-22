import { describe, expect, it } from "bun:test";
import type { TerminalSession } from "./types";

if (typeof window === "undefined") {
	(globalThis as Record<string, unknown>).window = globalThis;
}

const { SerializeAddon } = await import("@xterm/addon-serialize");
const { Terminal: HeadlessTerminal } = await import("@xterm/headless");
const { flushSession, getSerializedScrollback, recoverScrollback } =
	await import("./session");

function createTestHeadless() {
	const headless = new HeadlessTerminal({
		cols: 80,
		rows: 24,
		scrollback: 1000,
		allowProposedApi: true,
	});
	const serializer = new SerializeAddon();
	headless.loadAddon(
		serializer as unknown as Parameters<typeof headless.loadAddon>[0],
	);
	return { headless, serializer };
}

describe("session", () => {
	describe("recoverScrollback", () => {
		it("should write existing scrollback to headless and return true", async () => {
			const { headless, serializer } = createTestHeadless();

			const wasRecovered = recoverScrollback({
				existingScrollback: "existing content",
				headless,
			});

			expect(wasRecovered).toBe(true);

			// Wait for write to complete (xterm write is async)
			await new Promise<void>((resolve) => {
				headless.write("", resolve);
			});

			// The headless terminal should have the content
			const serialized = serializer.serialize();
			expect(serialized).toContain("existing content");

			headless.dispose();
		});

		it("should return false when no existing scrollback", () => {
			const { headless } = createTestHeadless();

			const wasRecovered = recoverScrollback({
				existingScrollback: null,
				headless,
			});

			expect(wasRecovered).toBe(false);

			headless.dispose();
		});
	});

	describe("getSerializedScrollback", () => {
		it("should return serialized content from headless terminal", async () => {
			const { headless, serializer } = createTestHeadless();

			// Wait for write to complete (xterm write is async)
			await new Promise<void>((resolve) => {
				headless.write("test output", resolve);
			});

			const mockSession = {
				headless,
				serializer,
			} as unknown as TerminalSession;

			const result = getSerializedScrollback(mockSession);
			expect(result).toContain("test output");

			headless.dispose();
		});
	});

	describe("flushSession", () => {
		it("should dispose data batcher and headless terminal", () => {
			let batcherDisposed = false;
			let headlessDisposed = false;

			const mockDataBatcher = {
				dispose: () => {
					batcherDisposed = true;
				},
			};

			const mockHeadless = {
				dispose: () => {
					headlessDisposed = true;
				},
			};

			const mockSession = {
				dataBatcher: mockDataBatcher,
				headless: mockHeadless,
			} as unknown as TerminalSession;

			flushSession(mockSession);

			expect(batcherDisposed).toBe(true);
			expect(headlessDisposed).toBe(true);
		});
	});
});
