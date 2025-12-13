import { describe, expect, it } from "bun:test";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { getHistoryDir } from "../terminal-history";
import { flushSession, recoverScrollback } from "./session";
import type { TerminalSession } from "./types";

describe("session", () => {
	describe("recoverScrollback", () => {
		it("should return existing scrollback if provided", async () => {
			const result = await recoverScrollback(
				"existing content",
				"workspace-1",
				"pane-1",
			);

			expect(result.scrollback).toBe("existing content");
			expect(result.wasRecovered).toBe(true);
		});

		it("should return empty scrollback when no history exists", async () => {
			const result = await recoverScrollback(
				null,
				"non-existent-workspace",
				"non-existent-pane",
			);

			expect(result.scrollback).toBe("");
			expect(result.wasRecovered).toBe(false);
		});

		it("should recover and filter scrollback from disk", async () => {
			const workspaceId = "workspace-recover-test";
			const paneId = "pane-recover-test";
			const historyDir = getHistoryDir(workspaceId, paneId);

			// Create test history file
			await fs.mkdir(historyDir, { recursive: true });
			const ESC = "\x1b";
			// Include escape sequences that should be filtered
			const rawScrollback = `hello${ESC}[1;1Rworld${ESC}[?1;0c`;
			await fs.writeFile(join(historyDir, "scrollback.bin"), rawScrollback);

			try {
				const result = await recoverScrollback(null, workspaceId, paneId);

				expect(result.wasRecovered).toBe(true);
				// Escape sequences should be filtered out
				expect(result.scrollback).toBe("helloworld");
			} finally {
				// Cleanup
				await fs.rm(historyDir, { recursive: true, force: true });
			}
		});

		it("should prefer existing scrollback over disk history", async () => {
			const workspaceId = "workspace-prefer-existing";
			const paneId = "pane-prefer-existing";
			const historyDir = getHistoryDir(workspaceId, paneId);

			// Create disk history
			await fs.mkdir(historyDir, { recursive: true });
			await fs.writeFile(join(historyDir, "scrollback.bin"), "disk content");

			try {
				const result = await recoverScrollback(
					"memory content",
					workspaceId,
					paneId,
				);

				// Should use the provided existing scrollback, not disk
				expect(result.scrollback).toBe("memory content");
				expect(result.wasRecovered).toBe(true);
			} finally {
				await fs.rm(historyDir, { recursive: true, force: true });
			}
		});
	});

	describe("flushSession", () => {
		it("should flush data batcher and escape filter", () => {
			let flushedData = "";
			const mockDataBatcher = {
				dispose: () => {
					flushedData = "batcher disposed";
				},
			};

			const mockEscapeFilter = {
				flush: () => "remaining data",
				filter: () => "",
			};

			let historyWritten = "";

			const mockSession = {
				dataBatcher: mockDataBatcher,
				escapeFilter: mockEscapeFilter,
				scrollback: "initial",
				historyWriter: {
					write: (data: string) => {
						historyWritten = data;
					},
				},
			} as unknown as TerminalSession;

			flushSession(mockSession);

			expect(flushedData).toBe("batcher disposed");
			expect(mockSession.scrollback).toBe("initialremaining data");
			expect(historyWritten).toBe("remaining data");
		});

		it("should handle empty flush from escape filter", () => {
			const mockDataBatcher = {
				dispose: () => {},
			};

			const mockEscapeFilter = {
				flush: () => "",
			};

			const mockSession = {
				dataBatcher: mockDataBatcher,
				escapeFilter: mockEscapeFilter,
				scrollback: "original",
				historyWriter: null,
			} as unknown as TerminalSession;

			flushSession(mockSession);

			// Scrollback should not be modified when flush returns empty
			expect(mockSession.scrollback).toBe("original");
		});
	});
});
