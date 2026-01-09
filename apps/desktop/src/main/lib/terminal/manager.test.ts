import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import * as pty from "node-pty";

// Mock node-pty
mock.module("node-pty", () => ({
	spawn: mock(() => {}),
}));

// Mock analytics to avoid electron imports (analytics → api-client → auth → electron.shell)
mock.module("main/lib/analytics", () => ({
	track: mock(() => {}),
}));

// Import manager after mocks are set up
const { TerminalManager } = await import("./manager");

describe("TerminalManager", () => {
	let manager: InstanceType<typeof TerminalManager>;
	let mockPty: {
		write: ReturnType<typeof mock>;
		resize: ReturnType<typeof mock>;
		kill: ReturnType<typeof mock>;
		onData: ReturnType<typeof mock>;
		onExit: ReturnType<typeof mock>;
	};

	beforeEach(() => {
		manager = new TerminalManager();

		// Setup mock pty
		mockPty = {
			write: mock(() => {}),
			resize: mock(() => {}),
			// biome-ignore lint/suspicious/noExplicitAny: Mock requires this binding for proper context
			kill: mock(function (this: any, _signal?: string) {
				// Automatically trigger onExit when kill is called to avoid timeouts in cleanup
				const onExitCallback =
					mockPty.onExit.mock.calls[mockPty.onExit.mock.calls.length - 1]?.[0];
				if (onExitCallback) {
					// Use setImmediate to avoid blocking
					setImmediate(async () => {
						await onExitCallback({ exitCode: 0, signal: undefined });
					});
				}
			}),
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
		await manager.cleanup();
		mock.restore();
	});

	describe("createOrAttach", () => {
		it("should create a new terminal session", async () => {
			const result = await manager.createOrAttach({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "workspace-1",
				cwd: "/test/path",
				cols: 80,
				rows: 24,
			});

			expect(result.isNew).toBe(true);
			expect(result.scrollback).toBe("");
			expect(result.wasRecovered).toBe(false);
			expect(pty.spawn).toHaveBeenCalledWith(
				expect.any(String),
				expect.any(Array),
				expect.objectContaining({
					cwd: "/test/path",
					cols: 80,
					rows: 24,
				}),
			);
		});

		it("should reuse existing terminal session", async () => {
			await manager.createOrAttach({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "workspace-1",
				cwd: "/test/path",
			});

			const spawnCallCount = (pty.spawn as ReturnType<typeof mock>).mock.calls
				.length;

			const result = await manager.createOrAttach({
				paneId: "pane-1",
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
			await manager.createOrAttach({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "workspace-1",
				cols: 80,
				rows: 24,
			});

			await manager.createOrAttach({
				paneId: "pane-1",
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
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.write({
				paneId: "pane-1",
				data: "ls -la\n",
			});

			// Wait for PtyWriteQueue async flush (uses setTimeout internally)
			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(mockPty.write).toHaveBeenCalledWith("ls -la\n");
		});

		it("should throw error for non-existent session", () => {
			expect(() => {
				manager.write({
					paneId: "non-existent",
					data: "test",
				});
			}).toThrow("Terminal session non-existent not found or not alive");
		});
	});

	describe("resize", () => {
		it("should resize terminal", async () => {
			await manager.createOrAttach({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.resize({
				paneId: "pane-1",
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
					paneId: "non-existent",
					cols: 80,
					rows: 24,
				});
			}).not.toThrow();

			// Verify warning was called
			expect(warnSpy).toHaveBeenCalledWith(
				"Cannot resize terminal non-existent: session not found or not alive",
			);

			console.warn = originalWarn;
		});
	});

	describe("signal", () => {
		it("should send signal to terminal", async () => {
			await manager.createOrAttach({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.signal({
				paneId: "pane-1",
				signal: "SIGINT",
			});

			expect(mockPty.kill).toHaveBeenCalledWith("SIGINT");
		});

		it("should use SIGTERM by default", async () => {
			await manager.createOrAttach({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.signal({
				paneId: "pane-1",
			});

			expect(mockPty.kill).toHaveBeenCalledWith("SIGTERM");
		});
	});

	describe("kill", () => {
		it("should kill the terminal session", async () => {
			await manager.createOrAttach({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			const exitPromise = new Promise<void>((resolve) => {
				manager.once("exit:pane-1", () => resolve());
			});

			await manager.kill({ paneId: "pane-1" });

			expect(mockPty.kill).toHaveBeenCalled();

			const onExitCallback =
				mockPty.onExit.mock.calls[mockPty.onExit.mock.calls.length - 1]?.[0];
			if (onExitCallback) {
				await onExitCallback({ exitCode: 0, signal: undefined });
			}

			await exitPromise;
		});
	});

	describe("detach", () => {
		it("should keep session alive after detach", async () => {
			await manager.createOrAttach({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.detach({ paneId: "pane-1" });

			const session = manager.getSession("pane-1");
			expect(session).not.toBeNull();
			expect(session?.isAlive).toBe(true);
		});
	});

	describe("getSession", () => {
		it("should return session metadata", async () => {
			await manager.createOrAttach({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "workspace-1",
				cwd: "/test/path",
			});

			const session = manager.getSession("pane-1");

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
		it("should kill all sessions and wait for exit handlers", async () => {
			await manager.createOrAttach({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			await manager.createOrAttach({
				paneId: "pane-2",
				tabId: "tab-2",
				workspaceId: "workspace-1",
			});

			const cleanupPromise = manager.cleanup();

			const onExitCallback1 = mockPty.onExit.mock.calls[0]?.[0];
			const onExitCallback2 = mockPty.onExit.mock.calls[1]?.[0];

			if (onExitCallback1) {
				await onExitCallback1({ exitCode: 0, signal: undefined });
			}
			if (onExitCallback2) {
				await onExitCallback2({ exitCode: 0, signal: undefined });
			}

			await cleanupPromise;

			expect(mockPty.kill).toHaveBeenCalledTimes(2);
		});
	});

	describe("event handling", () => {
		it("should emit data events", async () => {
			const dataHandler = mock(() => {});

			await manager.createOrAttach({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.on("data:pane-1", dataHandler);

			const onDataCallback = mockPty.onData.mock.results[0]?.value;
			if (onDataCallback) {
				onDataCallback("test output\n");
			}

			// Wait for DataBatcher to flush (16ms batching interval)
			await new Promise((resolve) => setTimeout(resolve, 30));

			expect(dataHandler).toHaveBeenCalledWith("test output\n");
		});

		it("should pass through raw data including escape sequences", async () => {
			const dataHandler = mock(() => {});

			await manager.createOrAttach({
				paneId: "pane-raw",
				tabId: "tab-raw",
				workspaceId: "workspace-1",
			});

			manager.on("data:pane-raw", dataHandler);

			const onDataCallback = mockPty.onData.mock.results[0]?.value;
			const dataWithEscapes =
				"hello\x1b[2;1R\x1b[?1;0cworld\x1b]10;rgb:ffff/ffff/ffff\x07\n";
			if (onDataCallback) {
				onDataCallback(dataWithEscapes);
			}

			// Wait for DataBatcher to flush (16ms batching interval)
			await new Promise((resolve) => setTimeout(resolve, 30));

			// Raw data passed through unchanged
			expect(dataHandler).toHaveBeenCalledWith(dataWithEscapes);
		});

		it("should emit exit events", async () => {
			const exitHandler = mock(() => {});

			await manager.createOrAttach({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			// Listen for exit event
			const exitPromise = new Promise<void>((resolve) => {
				manager.once("exit:pane-1", () => resolve());
			});

			manager.on("exit:pane-1", exitHandler);

			const onExitCallback = mockPty.onExit.mock.results[0]?.value;
			if (onExitCallback) {
				await onExitCallback({ exitCode: 0, signal: undefined });
			}

			await exitPromise;

			expect(exitHandler).toHaveBeenCalledWith(0, undefined);
		});
	});

	describe("killByWorkspaceId", () => {
		it("should kill session for a workspace and return count", async () => {
			await manager.createOrAttach({
				paneId: "pane-kill-single",
				tabId: "tab-kill-single",
				workspaceId: "workspace-kill-single",
			});

			const result = await manager.killByWorkspaceId("workspace-kill-single");

			// With the mock, the session exits cleanly via the kill mock's setImmediate
			expect(result.killed + result.failed).toBe(1);
		});

		it("should not kill sessions from other workspaces", async () => {
			await manager.createOrAttach({
				paneId: "pane-other",
				tabId: "tab-other",
				workspaceId: "workspace-other",
			});

			await manager.killByWorkspaceId("workspace-different");

			// Session should still exist
			expect(manager.getSession("pane-other")).not.toBeNull();
			expect(manager.getSession("pane-other")?.isAlive).toBe(true);
		});

		it("should return zero counts for non-existent workspace", async () => {
			const result = await manager.killByWorkspaceId("non-existent");

			expect(result.killed).toBe(0);
			expect(result.failed).toBe(0);
		});

		it("should clean up already-dead sessions", async () => {
			await manager.createOrAttach({
				paneId: "pane-dead",
				tabId: "tab-dead",
				workspaceId: "workspace-dead",
			});

			// Simulate the session dying naturally
			const onExitCallback =
				mockPty.onExit.mock.calls[mockPty.onExit.mock.calls.length - 1]?.[0];
			if (onExitCallback) {
				await onExitCallback({ exitCode: 0, signal: undefined });
			}

			// Wait for the dead session to be kept in map (5s timeout in onExit)
			await new Promise((resolve) => setTimeout(resolve, 100));

			const result = await manager.killByWorkspaceId("workspace-dead");

			expect(result.killed).toBe(1);
			expect(result.failed).toBe(0);
		});
	});

	describe("getSessionCountByWorkspaceId", () => {
		it("should return count of active sessions for workspace", async () => {
			await manager.createOrAttach({
				paneId: "pane-1",
				tabId: "tab-1",
				workspaceId: "workspace-count",
			});

			await manager.createOrAttach({
				paneId: "pane-2",
				tabId: "tab-2",
				workspaceId: "workspace-count",
			});

			await manager.createOrAttach({
				paneId: "pane-3",
				tabId: "tab-3",
				workspaceId: "other-workspace",
			});

			expect(
				await manager.getSessionCountByWorkspaceId("workspace-count"),
			).toBe(2);
			expect(
				await manager.getSessionCountByWorkspaceId("other-workspace"),
			).toBe(1);
		});

		it("should return zero for non-existent workspace", async () => {
			expect(await manager.getSessionCountByWorkspaceId("non-existent")).toBe(
				0,
			);
		});

		it("should not count dead sessions", async () => {
			await manager.createOrAttach({
				paneId: "pane-alive",
				tabId: "tab-alive",
				workspaceId: "workspace-mixed",
			});

			await manager.createOrAttach({
				paneId: "pane-dead",
				tabId: "tab-dead",
				workspaceId: "workspace-mixed",
			});

			// Simulate the second session dying
			const onExitCallback =
				mockPty.onExit.mock.calls[mockPty.onExit.mock.calls.length - 1]?.[0];
			if (onExitCallback) {
				await onExitCallback({ exitCode: 0, signal: undefined });
			}

			// Wait for state to update
			await new Promise((resolve) => setTimeout(resolve, 100));

			expect(
				await manager.getSessionCountByWorkspaceId("workspace-mixed"),
			).toBe(1);
		});
	});

	describe("clearScrollback", () => {
		it("should clear in-memory scrollback", async () => {
			await manager.createOrAttach({
				paneId: "pane-clear",
				tabId: "tab-clear",
				workspaceId: "workspace-1",
			});

			const onDataCallback =
				mockPty.onData.mock.calls[mockPty.onData.mock.calls.length - 1]?.[0];
			if (onDataCallback) {
				onDataCallback("some output\n");
			}

			manager.clearScrollback({ paneId: "pane-clear" });

			const result = await manager.createOrAttach({
				paneId: "pane-clear",
				tabId: "tab-clear",
				workspaceId: "workspace-1",
			});

			expect(result.scrollback).toBe("");
		});

		it("should handle non-existent session gracefully", () => {
			const warnSpy = mock(() => {});
			const originalWarn = console.warn;
			console.warn = warnSpy;

			expect(() =>
				manager.clearScrollback({ paneId: "non-existent" }),
			).not.toThrow();

			expect(warnSpy).toHaveBeenCalledWith(
				"Cannot clear scrollback for terminal non-existent: session not found",
			);

			console.warn = originalWarn;
		});

		it("should clear scrollback when shell sends clear sequence", async () => {
			await manager.createOrAttach({
				paneId: "pane-shell-clear",
				tabId: "tab-shell-clear",
				workspaceId: "workspace-1",
			});

			const onDataCallback =
				mockPty.onData.mock.calls[mockPty.onData.mock.calls.length - 1]?.[0];
			if (onDataCallback) {
				onDataCallback("some output\n");
				// ED3 sequence clears scrollback, then output after the sequence is stored
				onDataCallback("\x1b[3Jnew content after clear");
			}

			// Wait for headless terminal to process async writes
			await new Promise((resolve) => setTimeout(resolve, 50));

			const result = await manager.createOrAttach({
				paneId: "pane-shell-clear",
				tabId: "tab-shell-clear",
				workspaceId: "workspace-1",
			});

			// Only content after the clear sequence should remain
			expect(result.scrollback).not.toContain("some output");
			expect(result.scrollback).toContain("new content after clear");
			// ED3 sequence itself should NOT be in scrollback
			expect(result.scrollback).not.toContain("\x1b[3J");
		});

		it("should not persist content before clear sequence", async () => {
			await manager.createOrAttach({
				paneId: "pane-clear-before",
				tabId: "tab-clear-before",
				workspaceId: "workspace-1",
			});

			const onDataCallback =
				mockPty.onData.mock.calls[mockPty.onData.mock.calls.length - 1]?.[0];
			if (onDataCallback) {
				// Content before and after clear in same chunk
				onDataCallback("old content\x1b[3Jnew content");
			}

			// Wait for headless terminal to process async writes
			await new Promise((resolve) => setTimeout(resolve, 50));

			const result = await manager.createOrAttach({
				paneId: "pane-clear-before",
				tabId: "tab-clear-before",
				workspaceId: "workspace-1",
			});

			// Old content should be gone, only new content remains
			expect(result.scrollback).not.toContain("old content");
			expect(result.scrollback).toContain("new content");
			expect(result.scrollback).not.toContain("\x1b[3J");
		});
	});
});
