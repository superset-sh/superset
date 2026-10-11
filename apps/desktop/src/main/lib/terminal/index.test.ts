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
	stopMigratedV1SessionsOnBoot,
	type TerminalDaemonDeps,
	tryListExistingDaemonSessions as tryListExistingDaemonSessionsWith,
} from "./index";

let listSessionsIfRunningResult: ListSessionsResponse | null = null;
let listSessionsIfRunningError: Error | null = null;
let shutdownIfRunningError: Error | null = null;
let shutdownIfRunningCalls = 0;
let shutdownRequests: unknown[] = [];
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
		resetCalls = 0;
	});

	it("on boot stops only sessions of migrated workspaces", async () => {
		const killed: string[] = [];
		await stopMigratedV1SessionsOnBoot(new Set(["w-done"]), {
			listSessionsIfRunning: async () => ({
				sessions: [
					makeSession({ sessionId: "s-done", workspaceId: "w-done" }),
					makeSession({ sessionId: "s-failed", workspaceId: "w-failed" }),
				],
			}),
			killIfRunning: async ({ sessionId }) => {
				killed.push(sessionId);
				return true;
			},
			shutdownIfRunning: async (request) => {
				shutdownRequests.push(request);
				return { wasRunning: true };
			},
		});
		expect(killed).toEqual(["s-done"]);
		expect(shutdownRequests).toEqual([]);
	});

	it("a failed boot stop is logged, not thrown", async () => {
		await expect(
			stopMigratedV1SessionsOnBoot(new Set(["w-done"]), {
				listSessionsIfRunning: async () => {
					throw new Error("socket gone");
				},
				killIfRunning: async () => true,
				shutdownIfRunning: async () => ({ wasRunning: false }),
			}),
		).resolves.toBeUndefined();
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
