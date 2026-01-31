import { describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";

interface MockManagement {
	listSessions: () => Promise<{
		sessions: Array<{
			sessionId: string;
			paneId: string;
			workspaceId: string;
			isAlive: boolean;
		}>;
	}>;
	killAllSessions: () => Promise<void>;
	resetHistoryPersistence: () => Promise<void>;
}

/**
 * Mock terminal runtime for testing.
 * Extends EventEmitter and provides the minimal TerminalRuntime interface.
 */
class MockTerminalRuntime extends EventEmitter {
	management: MockManagement | null = null; // non-daemon mode
	capabilities = { persistent: false, coldRestore: false };
	killCalls: Array<{ paneId: string }> = [];

	async kill(params: { paneId: string }) {
		this.killCalls.push(params);
	}

	detachAllListeners() {
		for (const event of this.eventNames()) {
			const name = String(event);
			if (
				name.startsWith("data:") ||
				name.startsWith("exit:") ||
				name.startsWith("disconnect:") ||
				name.startsWith("error:") ||
				name === "terminalExit"
			) {
				this.removeAllListeners(event);
			}
		}
	}
}

let mockTerminal: MockTerminalRuntime = new MockTerminalRuntime();
let mockClientConnected = false;
let mockListSessionsCallCount = 0;
let mockDaemonSessions: Array<{
	sessionId: string;
	paneId: string;
	workspaceId: string;
	isAlive: boolean;
}> = [];
let mockListSessions: () => Promise<{ sessions: typeof mockDaemonSessions }> =
	async () => ({ sessions: mockDaemonSessions });

// Mock the workspace-runtime module
mock.module("main/lib/workspace-runtime", () => ({
	getWorkspaceRuntimeRegistry: () => ({
		getDefault: () => ({
			id: "local",
			terminal: mockTerminal,
			capabilities: { terminal: mockTerminal.capabilities },
		}),
		getForWorkspaceId: () => ({
			id: "local",
			terminal: mockTerminal,
			capabilities: { terminal: mockTerminal.capabilities },
		}),
	}),
}));

// Avoid importing Electron/local-db during test bootstrap.
mock.module("main/lib/local-db", () => ({
	localDb: {
		select: () => ({
			from: () => ({
				where: () => ({
					get: () => undefined,
				}),
			}),
		}),
	},
}));

// Mock terminal module to avoid Electron imports from terminal-host/client
// The mock checks mockTerminal.management to determine daemon mode
mock.module("main/lib/terminal", () => ({
	tryListExistingDaemonSessions: async () => {
		// Check if mockTerminal.management is set to simulate daemon mode
		if (mockTerminal.management) {
			const result = await mockTerminal.management.listSessions();
			return {
				daemonRunning: true,
				sessions: result.sessions,
			};
		}
		return {
			daemonRunning: false,
			sessions: [],
		};
	},
	getDaemonTerminalManager: () => ({
		reset: () => {},
	}),
}));

// Mock terminal-host/client to avoid Electron app import
mock.module("main/lib/terminal-host/client", () => ({
	getTerminalHostClient: () => ({
		tryConnectAndAuthenticate: async () => mockClientConnected,
		listSessions: async () => mockListSessions(),
		killAll: async () => ({}),
		kill: async () => ({}),
	}),
	disposeTerminalHostClient: () => {},
}));

const { createTerminalRouter } = await import("./terminal");

describe("terminal.stream", () => {
	it("does not complete on exit (paneId is stable across restarts)", async () => {
		// Reset the mock terminal for this test
		mockTerminal = new MockTerminalRuntime();

		const router = createTerminalRouter();
		const caller = router.createCaller({} as never);
		const stream$ = await caller.stream("pane-1");

		const events: Array<{ type: string }> = [];
		let didComplete = false;

		const subscription = stream$.subscribe({
			next: (event) => {
				events.push(event);
			},
			complete: () => {
				didComplete = true;
			},
		});

		// Emit exit event - stream should NOT complete
		mockTerminal.emit("exit:pane-1", 0, 15);

		expect(didComplete).toBe(false);
		expect(mockTerminal.listenerCount("data:pane-1")).toBeGreaterThan(0);

		// Data should still be receivable after exit
		mockTerminal.emit("data:pane-1", "echo ok\r\n");

		expect(events.map((e) => e.type)).toEqual(["exit", "data"]);

		subscription.unsubscribe();

		// All listeners should be cleaned up after unsubscribe
		expect(mockTerminal.listenerCount("data:pane-1")).toBe(0);
		expect(mockTerminal.listenerCount("exit:pane-1")).toBe(0);
		expect(mockTerminal.listenerCount("disconnect:pane-1")).toBe(0);
		expect(mockTerminal.listenerCount("error:pane-1")).toBe(0);
	});

	it("does not complete on disconnect event", async () => {
		mockTerminal = new MockTerminalRuntime();

		const router = createTerminalRouter();
		const caller = router.createCaller({} as never);
		const stream$ = await caller.stream("pane-2");

		const events: Array<{ type: string }> = [];
		let didComplete = false;

		const subscription = stream$.subscribe({
			next: (event) => {
				events.push(event);
			},
			complete: () => {
				didComplete = true;
			},
		});

		// Emit disconnect event - stream should NOT complete
		mockTerminal.emit("disconnect:pane-2", "Connection lost");

		expect(didComplete).toBe(false);
		expect(events.map((e) => e.type)).toEqual(["disconnect"]);

		subscription.unsubscribe();
	});

	it("does not complete on error event", async () => {
		mockTerminal = new MockTerminalRuntime();

		const router = createTerminalRouter();
		const caller = router.createCaller({} as never);
		const stream$ = await caller.stream("pane-3");

		const events: Array<{ type: string }> = [];
		let didComplete = false;

		const subscription = stream$.subscribe({
			next: (event) => {
				events.push(event);
			},
			complete: () => {
				didComplete = true;
			},
		});

		// Emit error event - stream should NOT complete
		mockTerminal.emit("error:pane-3", { error: "Test error", code: "TEST" });

		expect(didComplete).toBe(false);
		expect(events.map((e) => e.type)).toEqual(["error"]);

		subscription.unsubscribe();
	});
});

describe("terminal.management capability", () => {
	it("returns daemonModeEnabled: false when management is null", async () => {
		mockTerminal = new MockTerminalRuntime();
		mockTerminal.management = null; // non-daemon mode

		const router = createTerminalRouter();
		const caller = router.createCaller({} as never);
		const result = await caller.listDaemonSessions();

		expect(result.daemonModeEnabled).toBe(false);
		expect(result.sessions).toEqual([]);
	});

	it("returns daemonModeEnabled: true when management is present", async () => {
		mockTerminal = new MockTerminalRuntime();
		// Mock daemon mode with management capability
		mockTerminal.management = {
			listSessions: async () => ({
				sessions: [
					{
						sessionId: "pane-1",
						paneId: "pane-1",
						workspaceId: "ws-1",
						isAlive: true,
					},
				],
			}),
			killAllSessions: async () => {},
			resetHistoryPersistence: async () => {},
		};

		const router = createTerminalRouter();
		const caller = router.createCaller({} as never);
		const result = await caller.listDaemonSessions();

		expect(result.daemonModeEnabled).toBe(true);
		expect(result.sessions.length).toBe(1);
		expect(result.sessions[0].sessionId).toBe("pane-1");
	});
});

describe("terminal daemon kill helpers", () => {
	it("killAllDaemonSessions forwards kills for each daemon session", async () => {
		mockTerminal = new MockTerminalRuntime();
		mockClientConnected = true;
		mockDaemonSessions = [
			{
				sessionId: "pane-1",
				paneId: "pane-1",
				workspaceId: "ws-1",
				isAlive: true,
			},
			{
				sessionId: "pane-2",
				paneId: "pane-2",
				workspaceId: "ws-2",
				isAlive: true,
			},
		];
		mockListSessionsCallCount = 0;
		mockListSessions = async () => {
			mockListSessionsCallCount++;
			if (mockListSessionsCallCount === 1) {
				return { sessions: mockDaemonSessions };
			}
			return { sessions: [] };
		};

		const router = createTerminalRouter();
		const caller = router.createCaller({} as never);
		const result = await caller.killAllDaemonSessions();

		expect(result.daemonModeEnabled).toBe(true);
		expect(result.killedCount).toBe(2);
		expect(mockTerminal.killCalls).toEqual([
			{ paneId: "pane-1" },
			{ paneId: "pane-2" },
		]);
	});

	it("killDaemonSessionsForWorkspace only kills matching workspace sessions", async () => {
		mockTerminal = new MockTerminalRuntime();
		mockClientConnected = true;
		mockDaemonSessions = [
			{
				sessionId: "pane-1",
				paneId: "pane-1",
				workspaceId: "ws-1",
				isAlive: true,
			},
			{
				sessionId: "pane-2",
				paneId: "pane-2",
				workspaceId: "ws-2",
				isAlive: true,
			},
		];
		mockListSessions = async () => ({ sessions: mockDaemonSessions });

		const router = createTerminalRouter();
		const caller = router.createCaller({} as never);
		const result = await caller.killDaemonSessionsForWorkspace({
			workspaceId: "ws-1",
		});

		expect(result.daemonModeEnabled).toBe(true);
		expect(result.killedCount).toBe(1);
		expect(mockTerminal.killCalls).toEqual([{ paneId: "pane-1" }]);
	});
});
