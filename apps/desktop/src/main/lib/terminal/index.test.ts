import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import type { ListSessionsResponse } from "main/lib/terminal-host/types";

let listSessionsIfRunningResult: ListSessionsResponse | null = null;
let listSessionsIfRunningError: Error | null = null;
let shutdownIfRunningError: Error | null = null;
let shutdownIfRunningCalls = 0;
let resetCalls = 0;

function makeSession(
	overrides: Partial<ListSessionsResponse["sessions"][number]> = {},
): ListSessionsResponse["sessions"][number] {
	return {
		sessionId: "session-1",
		workspaceId: "workspace-1",
		paneId: "pane-1",
		isAlive: true,
		attachedClients: 0,
		pid: 123,
		...overrides,
	};
}

mock.module("main/lib/terminal-host/client", () => ({
	getTerminalHostClient: () => ({
		listSessionsIfRunning: async () => {
			if (listSessionsIfRunningError) {
				throw listSessionsIfRunningError;
			}
			return listSessionsIfRunningResult;
		},
		shutdownIfRunning: async () => {
			shutdownIfRunningCalls++;
			if (shutdownIfRunningError) {
				throw shutdownIfRunningError;
			}
			return { wasRunning: true };
		},
		ensureConnected: async () => {},
	}),
	disposeTerminalHostClient: () => {},
}));

mock.module("./daemon", () => ({
	DaemonTerminalManager: class {},
	getDaemonTerminalManager: () => ({
		reset: () => {
			resetCalls++;
		},
		reconcileOnStartup: async () => {},
	}),
}));

const { restartDaemon, tryListExistingDaemonSessions } = await import(
	"./index"
);

describe("terminal index", () => {
	beforeAll(() => {
		spyOn(console, "log").mockImplementation(() => {});
		spyOn(console, "warn").mockImplementation(() => {});
	});

	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		listSessionsIfRunningResult = null;
		listSessionsIfRunningError = null;
		shutdownIfRunningError = null;
		shutdownIfRunningCalls = 0;
		resetCalls = 0;
	});

	it("resets the daemon manager when no daemon is running", async () => {
		await expect(restartDaemon()).resolves.toEqual({ success: true });
		expect(shutdownIfRunningCalls).toBe(0);
		expect(resetCalls).toBe(1);
	});

	it("shuts down the daemon before resetting when sessions exist", async () => {
		listSessionsIfRunningResult = {
			sessions: [makeSession()],
		};

		await expect(restartDaemon()).resolves.toEqual({ success: true });
		expect(shutdownIfRunningCalls).toBe(1);
		expect(resetCalls).toBe(1);
	});

	it("throws and does not reset when the passive probe fails", async () => {
		listSessionsIfRunningError = new Error("probe failed");

		await expect(restartDaemon()).rejects.toThrow("probe failed");
		expect(shutdownIfRunningCalls).toBe(0);
		expect(resetCalls).toBe(0);
	});

	it("throws and does not reset when daemon shutdown fails", async () => {
		listSessionsIfRunningResult = {
			sessions: [makeSession()],
		};
		shutdownIfRunningError = new Error("shutdown failed");

		await expect(restartDaemon()).rejects.toThrow("shutdown failed");
		expect(shutdownIfRunningCalls).toBe(1);
		expect(resetCalls).toBe(0);
	});

	it("returns an empty session list when the daemon is absent", async () => {
		await expect(tryListExistingDaemonSessions()).resolves.toEqual({
			sessions: [],
		});
	});

	it("falls back to an empty session list when the passive probe throws", async () => {
		listSessionsIfRunningError = new Error("probe failed");

		await expect(tryListExistingDaemonSessions()).resolves.toEqual({
			sessions: [],
		});
	});
});
