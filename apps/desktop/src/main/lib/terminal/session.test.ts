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

		it("should recover scrollback from disk", async () => {
			const workspaceId = "workspace-recover-test";
			const paneId = "pane-recover-test";
			const historyDir = getHistoryDir(workspaceId, paneId);

			// Create test history file
			await fs.mkdir(historyDir, { recursive: true });
			const scrollbackContent = "hello world";
			await fs.writeFile(join(historyDir, "scrollback.bin"), scrollbackContent);

			try {
				const result = await recoverScrollback(null, workspaceId, paneId);

				expect(result.wasRecovered).toBe(true);
				expect(result.scrollback).toBe(scrollbackContent);
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
		it("should dispose data batcher", () => {
			let disposed = false;
			const mockDataBatcher = {
				dispose: () => {
					disposed = true;
				},
			};

			const mockSession = {
				dataBatcher: mockDataBatcher,
				scrollback: "initial",
			} as unknown as TerminalSession;

			flushSession(mockSession);

			expect(disposed).toBe(true);
		});
	});
});
