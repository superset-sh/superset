// Tests for the `terminal.daemon` tRPC procedures.
//
// We exercise the wiring (procedure → supervisor delegation, env.ORGANIZATION_ID
// resolution) against a stubbed singleton supervisor, not a real spawn.
// Real spawn coverage is in src/daemon/DaemonSupervisor.node-test.ts.

import { beforeEach, describe, expect, mock, test } from "bun:test";
// We need to control what `getSupervisor()` returns AND what
// `waitForDaemonReady` does. The cleanest way is to install a stub
// supervisor into the singleton via `getSupervisor("...")` (which
// constructs lazily on first call) then monkey-patch the methods we
// care about.
import { __resetSupervisorForTesting, getSupervisor } from "../../../daemon";

// Make env.ORGANIZATION_ID resolvable. The env module reads from
// process.env at module load via @t3-oss/env-core, so we must set
// the var BEFORE importing.
process.env.ORGANIZATION_ID = "00000000-0000-4000-8000-000000000000";
process.env.HOST_SERVICE_SECRET = "test-secret";
process.env.HOST_DB_PATH = "/tmp/test-host.db";
process.env.HOST_MIGRATIONS_FOLDER = "/tmp/test-migrations";
process.env.AUTH_TOKEN = "test-auth-token";
process.env.SUPERSET_API_URL = "https://cloud.example.com";

const { appRouter } = await import("../router.ts");

function makeCaller(authenticated = true) {
	// Cast to whatever; we only invoke procedures that don't touch db/git/etc.
	return appRouter.createCaller({
		isAuthenticated: authenticated,
	} as unknown as Parameters<typeof appRouter.createCaller>[0]);
}

beforeEach(() => {
	__resetSupervisorForTesting();
});

describe("terminal.daemon tRPC procedures", () => {
	test("rejects with UNAUTHORIZED when ctx is unauthenticated", async () => {
		const caller = makeCaller(false);
		await expect(caller.terminal.daemon.getUpdateStatus()).rejects.toThrow(
			/Invalid or missing/,
		);
	});

	test("getUpdateStatus delegates to supervisor", async () => {
		const sup = getSupervisor("/nonexistent");
		const getUpdateStatusMock = mock(() => ({
			pending: true,
			running: "0.0.9",
			expected: "0.1.0",
		}));
		(
			sup as unknown as { getUpdateStatus: typeof sup.getUpdateStatus }
		).getUpdateStatus = getUpdateStatusMock as typeof sup.getUpdateStatus;

		const caller = makeCaller();
		const result = await caller.terminal.daemon.getUpdateStatus();

		expect(getUpdateStatusMock).toHaveBeenCalledTimes(1);
		expect(getUpdateStatusMock).toHaveBeenCalledWith(
			"00000000-0000-4000-8000-000000000000",
		);
		expect(result).toEqual({
			pending: true,
			running: "0.0.9",
			expected: "0.1.0",
		});
	});

	test("listSessions awaits bootstrap before delegating", async () => {
		const sup = getSupervisor("/nonexistent");
		const order: string[] = [];

		const ensureMock = mock(async () => {
			order.push("ensure");
			await new Promise((r) => setTimeout(r, 30));
			return {} as Awaited<ReturnType<typeof sup.ensure>>;
		});
		(sup as unknown as { ensure: typeof sup.ensure }).ensure =
			ensureMock as typeof sup.ensure;

		const listMock = mock(async () => {
			order.push("list");
			return [];
		});
		(sup as unknown as { listSessions: typeof sup.listSessions }).listSessions =
			listMock as typeof sup.listSessions;

		const caller = makeCaller();
		const result = await caller.terminal.daemon.listSessions();

		expect(result).toEqual([]);
		// Bootstrap must have started before list resolved.
		expect(order[0]).toBe("ensure");
		expect(order).toContain("list");
	});

	test("restart awaits bootstrap then delegates to supervisor.restart", async () => {
		const sup = getSupervisor("/nonexistent");
		const ensureMock = mock(
			async () => ({}) as Awaited<ReturnType<typeof sup.ensure>>,
		);
		const restartMock = mock(async () => ({ success: true as const }));
		(sup as unknown as { ensure: typeof sup.ensure }).ensure =
			ensureMock as typeof sup.ensure;
		(sup as unknown as { restart: typeof sup.restart }).restart =
			restartMock as typeof sup.restart;

		const caller = makeCaller();
		const result = await caller.terminal.daemon.restart();

		expect(result).toEqual({ success: true });
		expect(restartMock).toHaveBeenCalledWith(
			"00000000-0000-4000-8000-000000000000",
		);
	});
});
