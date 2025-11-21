import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as pty from "node-pty";
import { TerminalManager } from "./terminal-manager";

// Mock node-pty
mock.module("node-pty", () => ({
	spawn: mock(() => {}),
}));

describe("TerminalManager", () => {
	let manager: TerminalManager;
	let mockPty: {
		write: ReturnType<typeof mock>;
		resize: ReturnType<typeof mock>;
		kill: ReturnType<typeof mock>;
		onData: ReturnType<typeof mock>;
		onExit: ReturnType<typeof mock>;
	};

	beforeEach(async () => {
		// Clean up test history files before each test
		const historyDir = join(homedir(), ".superset", "terminal-history");
		try {
			await fs.rm(historyDir, { recursive: true, force: true });
		} catch {
			// Ignore errors if directory doesn't exist
		}

		manager = new TerminalManager();

		// Setup mock pty
		mockPty = {
			write: mock(() => {}),
			resize: mock(() => {}),
			kill: mock(() => {}),
			onData: mock((callback: (data: string) => void) => {
				// Store callback for testing
				mockPty.onData.mockImplementation(() => callback);
				return callback;
			}),
			onExit: mock(
				(callback: (event: { exitCode: number; signal?: number }) => void) => {
					mockPty.onExit.mockImplementation(() => callback);
					return callback;
				},
			),
		};

		(pty.spawn as ReturnType<typeof mock>).mockReturnValue(
			mockPty as unknown as pty.IPty,
		);
	});

	afterEach(async () => {
		manager.cleanup();
		mock.restore();

		// Clean up test history files
		const historyDir = join(homedir(), ".superset", "terminal-history");
		try {
			await fs.rm(historyDir, { recursive: true, force: true });
		} catch {
			// Ignore errors if directory doesn't exist
		}
	});

	describe("createOrAttach", () => {
		it("should create a new terminal session", async () => {
			const result = await manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
				cwd: "/test/path",
				cols: 80,
				rows: 24,
			});

			expect(result.isNew).toBe(true);
			expect(result.scrollback).toEqual([]);
			expect(result.wasRecovered).toBe(false);
			expect(pty.spawn).toHaveBeenCalledWith(
				expect.any(String),
				[],
				expect.objectContaining({
					cwd: "/test/path",
					cols: 80,
					rows: 24,
				}),
			);
		});

		it("should reuse existing terminal session", async () => {
			// Create initial session
			await manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
				cwd: "/test/path",
			});

			const spawnCallCount = (pty.spawn as ReturnType<typeof mock>).mock.calls
				.length;

			// Attempt to attach to same session
			const result = await manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			expect(result.isNew).toBe(false);
			// Should not have spawned again
			expect((pty.spawn as ReturnType<typeof mock>).mock.calls.length).toBe(
				spawnCallCount,
			);
		});

		it("should update size when reattaching with new dimensions", async () => {
			// Create initial session
			await manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
				cols: 80,
				rows: 24,
			});

			// Reattach with different size
			await manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
				cols: 100,
				rows: 30,
			});

			expect(mockPty.resize).toHaveBeenCalledWith(100, 30);
		});
	});

	describe("write", () => {
		it("should write data to terminal", async () => {
			await manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.write({
				tabId: "tab-1",
				data: "ls -la\n",
			});

			expect(mockPty.write).toHaveBeenCalledWith("ls -la\n");
		});

		it("should throw error for non-existent session", () => {
			expect(() => {
				manager.write({
					tabId: "non-existent",
					data: "test",
				});
			}).toThrow("Terminal session non-existent not found or not alive");
		});
	});

	describe("resize", () => {
		it("should resize terminal", async () => {
			await manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.resize({
				tabId: "tab-1",
				cols: 120,
				rows: 40,
			});

			expect(mockPty.resize).toHaveBeenCalledWith(120, 40);
		});

		it("should handle resize of non-existent session gracefully", () => {
			// Mock console.warn to suppress the warning in test output
			const warnSpy = mock(() => {});
			const originalWarn = console.warn;
			console.warn = warnSpy;

			// Should not throw
			expect(() => {
				manager.resize({
					tabId: "non-existent",
					cols: 80,
					rows: 24,
				});
			}).not.toThrow();

			// Verify warning was called
			expect(warnSpy).toHaveBeenCalledWith(
				"Cannot resize terminal non-existent: session not found or not alive",
			);

			// Restore console.warn
			console.warn = originalWarn;
		});
	});

	describe("signal", () => {
		it("should send signal to terminal", async () => {
			await manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.signal({
				tabId: "tab-1",
				signal: "SIGINT",
			});

			expect(mockPty.kill).toHaveBeenCalledWith("SIGINT");
		});

		it("should use SIGTERM by default", async () => {
			await manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.signal({
				tabId: "tab-1",
			});

			expect(mockPty.kill).toHaveBeenCalledWith("SIGTERM");
		});
	});

	describe("kill", () => {
		it("should kill and remove session without deleting history by default", async () => {
			await manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			await manager.kill({ tabId: "tab-1" });

			expect(mockPty.kill).toHaveBeenCalled();

			const session = manager.getSession("tab-1");
			expect(session).toBeNull();

			// Verify history directory still exists
			const historyDir = join(
				homedir(),
				".superset",
				"terminal-history",
				"workspace-1",
				"tab-1",
			);
			const stats = await fs.stat(historyDir);
			expect(stats.isDirectory()).toBe(true);
		});

		it("should delete history when deleteHistory flag is true", async () => {
			await manager.createOrAttach({
				tabId: "tab-delete-history",
				workspaceId: "workspace-1",
			});

			await manager.kill({ tabId: "tab-delete-history", deleteHistory: true });

			expect(mockPty.kill).toHaveBeenCalled();

			const session = manager.getSession("tab-delete-history");
			expect(session).toBeNull();

			// Verify history directory is deleted
			const historyDir = join(
				homedir(),
				".superset",
				"terminal-history",
				"workspace-1",
				"tab-delete-history",
			);
			try {
				await fs.stat(historyDir);
				throw new Error("Directory should not exist");
			} catch (error) {
				// @ts-ignore
				expect(error.code).toBe("ENOENT");
			}
		});

		it("should preserve history for recovery after kill without deleteHistory", async () => {
			// Create and write some data
			await manager.createOrAttach({
				tabId: "tab-preserve",
				workspaceId: "workspace-1",
			});

			// Simulate some output
			const onDataCallback =
				mockPty.onData.mock.calls[mockPty.onData.mock.calls.length - 1]?.[0];
			if (onDataCallback) {
				onDataCallback("Preserved output\n");
			}

			// Kill without deleting history
			await manager.kill({ tabId: "tab-preserve" });

			// Wait for finalization
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Recreate session - should recover history
			const result = await manager.createOrAttach({
				tabId: "tab-preserve",
				workspaceId: "workspace-1",
			});

			expect(result.wasRecovered).toBe(true);
			expect(result.scrollback[0]).toContain("Preserved output");
		});
	});

	describe("detach", () => {
		it("should keep session alive after detach", async () => {
			await manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.detach({ tabId: "tab-1" });

			const session = manager.getSession("tab-1");
			expect(session).not.toBeNull();
			expect(session?.isAlive).toBe(true);
		});
	});

	describe("getSession", () => {
		it("should return session metadata", async () => {
			await manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
				cwd: "/test/path",
			});

			const session = manager.getSession("tab-1");

			expect(session).toMatchObject({
				isAlive: true,
				cwd: "/test/path",
			});
			expect(session?.lastActive).toBeGreaterThan(0);
		});

		it("should return null for non-existent session", () => {
			const session = manager.getSession("non-existent");
			expect(session).toBeNull();
		});
	});

	describe("cleanup", () => {
		it("should kill all sessions", async () => {
			await manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			await manager.createOrAttach({
				tabId: "tab-2",
				workspaceId: "workspace-1",
			});

			manager.cleanup();

			expect(mockPty.kill).toHaveBeenCalledTimes(2);
		});
	});

	describe("event handling", () => {
		it("should emit data events", async () => {
			const dataHandler = mock(() => {});

			await manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.on("data:tab-1", dataHandler);

			// Simulate pty data
			const onDataCallback = mockPty.onData.mock.results[0]?.value;
			if (onDataCallback) {
				onDataCallback("test output\n");
			}

			expect(dataHandler).toHaveBeenCalledWith("test output\n");
		});

		it("should emit exit events", async () => {
			const exitHandler = mock(() => {});

			await manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.on("exit:tab-1", exitHandler);

			// Simulate pty exit
			const onExitCallback = mockPty.onExit.mock.results[0]?.value;
			if (onExitCallback) {
				await onExitCallback({ exitCode: 0, signal: undefined });
			}

			// Wait a bit for async operations to complete
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(exitHandler).toHaveBeenCalledWith(0, undefined);
		});
	});

	describe("multi-session history persistence", () => {
		it("should persist history across multiple sessions", async () => {
			const historyDir = join(
				homedir(),
				".superset",
				"terminal-history",
				"workspace-1",
				"tab-multi",
			);

			// Session 1: Create and write some data
			const result1 = await manager.createOrAttach({
				tabId: "tab-multi",
				workspaceId: "workspace-1",
			});

			expect(result1.isNew).toBe(true);
			expect(result1.wasRecovered).toBe(false);

			// Simulate some terminal output by calling the PTY onData callback
			const onDataCallback1 =
				mockPty.onData.mock.calls[mockPty.onData.mock.calls.length - 1]?.[0];
			if (onDataCallback1) {
				onDataCallback1("Session 1 output\n");
			}

			// Simulate exit by calling the PTY onExit callback
			const onExitCallback1 =
				mockPty.onExit.mock.calls[mockPty.onExit.mock.calls.length - 1]?.[0];
			if (onExitCallback1) {
				await onExitCallback1({ exitCode: 0, signal: undefined });
			}

			// Wait for finalization
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Manually cleanup the session (instead of waiting for timeout)
			manager.cleanup();

			// Session 2: Attach again (should recover history)
			const result2 = await manager.createOrAttach({
				tabId: "tab-multi",
				workspaceId: "workspace-1",
			});

			expect(result2.isNew).toBe(true);
			expect(result2.wasRecovered).toBe(true);
			expect(result2.scrollback[0]).toContain("Session 1 output");

			// Wait for writer to be fully initialized
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Simulate session 2 output by calling the PTY onData callback
			const onDataCallback2 =
				mockPty.onData.mock.calls[mockPty.onData.mock.calls.length - 1]?.[0];
			if (onDataCallback2) {
				onDataCallback2("Session 2 output\n");
			}

			// Simulate exit by calling the PTY onExit callback
			const onExitCallback2 =
				mockPty.onExit.mock.calls[mockPty.onExit.mock.calls.length - 1]?.[0];
			if (onExitCallback2) {
				await onExitCallback2({ exitCode: 0, signal: undefined });
			}

			// Wait for finalization
			await new Promise((resolve) => setTimeout(resolve, 50));

			// Manually cleanup the session
			manager.cleanup();

			// Session 3: Attach again (should recover both sessions' history)
			const result3 = await manager.createOrAttach({
				tabId: "tab-multi",
				workspaceId: "workspace-1",
			});

			expect(result3.isNew).toBe(true);
			expect(result3.wasRecovered).toBe(true);
			expect(result3.scrollback[0]).toContain("Session 1 output");
			expect(result3.scrollback[0]).toContain("Session 2 output");

			// Cleanup
			await fs.rm(historyDir, { recursive: true, force: true });
		});
	});
});
