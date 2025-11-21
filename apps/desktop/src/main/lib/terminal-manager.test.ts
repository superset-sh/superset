import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
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

	beforeEach(() => {
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

	afterEach(() => {
		manager.cleanup();
		mock.restore();
	});

	describe("createOrAttach", () => {
		it("should create a new terminal session", () => {
			const result = manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
				cwd: "/test/path",
				cols: 80,
				rows: 24,
			});

			expect(result.isNew).toBe(true);
			expect(result.scrollback).toEqual([]);
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

		it("should reuse existing terminal session", () => {
			// Create initial session
			manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
				cwd: "/test/path",
			});

			const spawnCallCount = (pty.spawn as ReturnType<typeof mock>).mock.calls
				.length;

			// Attempt to attach to same session
			const result = manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			expect(result.isNew).toBe(false);
			// Should not have spawned again
			expect((pty.spawn as ReturnType<typeof mock>).mock.calls.length).toBe(
				spawnCallCount,
			);
		});

		it("should update size when reattaching with new dimensions", () => {
			// Create initial session
			manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
				cols: 80,
				rows: 24,
			});

			// Reattach with different size
			manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
				cols: 100,
				rows: 30,
			});

			expect(mockPty.resize).toHaveBeenCalledWith(100, 30);
		});
	});

	describe("write", () => {
		it("should write data to terminal", () => {
			manager.createOrAttach({
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
		it("should resize terminal", () => {
			manager.createOrAttach({
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
		it("should send signal to terminal", () => {
			manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.signal({
				tabId: "tab-1",
				signal: "SIGINT",
			});

			expect(mockPty.kill).toHaveBeenCalledWith("SIGINT");
		});

		it("should use SIGTERM by default", () => {
			manager.createOrAttach({
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
		it("should kill and remove session", () => {
			manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.kill({ tabId: "tab-1" });

			expect(mockPty.kill).toHaveBeenCalled();

			const session = manager.getSession("tab-1");
			expect(session).toBeNull();
		});
	});

	describe("detach", () => {
		it("should keep session alive after detach", () => {
			manager.createOrAttach({
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
		it("should return session metadata", () => {
			manager.createOrAttach({
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
		it("should kill all sessions", () => {
			manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.createOrAttach({
				tabId: "tab-2",
				workspaceId: "workspace-1",
			});

			manager.cleanup();

			expect(mockPty.kill).toHaveBeenCalledTimes(2);
		});
	});

	describe("event handling", () => {
		it("should emit data events", () => {
			const dataHandler = mock(() => {});

			manager.createOrAttach({
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

		it("should emit exit events", () => {
			const exitHandler = mock(() => {});

			manager.createOrAttach({
				tabId: "tab-1",
				workspaceId: "workspace-1",
			});

			manager.on("exit:tab-1", exitHandler);

			// Simulate pty exit
			const onExitCallback = mockPty.onExit.mock.results[0]?.value;
			if (onExitCallback) {
				onExitCallback({ exitCode: 0, signal: undefined });
			}

			expect(exitHandler).toHaveBeenCalledWith(0, undefined);
		});
	});
});
