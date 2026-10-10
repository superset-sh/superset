import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	spyOn,
} from "bun:test";
import type { ListSessionsResponse } from "main/lib/terminal-host/types";
import {
	restartDaemon as restartDaemonWith,
	type TerminalDaemonDeps,
	tryListExistingDaemonSessions as tryListExistingDaemonSessionsWith,
} from "./index";

let listSessionsIfRunningResult: ListSessionsResponse | null = null;
let listSessionsIfRunningError: Error | null = null;
let shutdownIfRunningError: Error | null = null;
let shutdownIfRunningCalls = 0;
let shutdownRequests: unknown[] = [];
let ensureConnectedCalls = 0;
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

const deps: TerminalDaemonDeps = {
	getTerminalHostClient: () => ({
		listSessionsIfRunning: async () => {
			if (listSessionsIfRunningError) {
				throw listSessionsIfRunningError;
			}
			return listSessionsIfRunningResult;
		},
		shutdownIfRunning: async (request: unknown) => {
			shutdownIfRunningCalls++;
			shutdownRequests.push(request);
			if (shutdownIfRunningError) {
				throw shutdownIfRunningError;
			}
			return { wasRunning: true };
		},
	}),
	getDaemonTerminalManager: () => ({
		reset: () => {
			resetCalls++;
		},
	}),
};

const restartDaemon = () => restartDaemonWith(deps);
const tryListExistingDaemonSessions = () =>
	tryListExistingDaemonSessionsWith(deps);

describe("terminal index", () => {
	let consoleSpies: { mockRestore: () => void }[] = [];

	beforeAll(() => {
		consoleSpies = [
			spyOn(console, "log").mockImplementation(() => {}),
			spyOn(console, "warn").mockImplementation(() => {}),
		];
	});

	afterAll(() => {
		for (const spy of consoleSpies) spy.mockRestore();
	});

	beforeEach(() => {
		listSessionsIfRunningResult = null;
		listSessionsIfRunningError = null;
		shutdownIfRunningError = null;
		shutdownIfRunningCalls = 0;
		shutdownRequests = [];
		ensureConnectedCalls = 0;
		resetCalls = 0;
	});

	it("stops a v1 daemon left from before boot, sessions included", async () => {
		await shutdownV1DaemonOnBoot();
		expect(shutdownRequests).toEqual([{ killSessions: true }]);
		expect(ensureConnectedCalls).toBe(0);
		expect(resetCalls).toBe(1);
	});

	it("a failed boot shutdown is logged, not thrown", async () => {
		shutdownIfRunningError = new Error("socket gone");
		await expect(shutdownV1DaemonOnBoot()).resolves.toBeUndefined();
		expect(resetCalls).toBe(1);
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
