import { beforeAll, describe, expect, mock, test } from "bun:test";

// ---------------------------------------------------------------------------
// DB mock state — mutated per-test via `dbState`
// ---------------------------------------------------------------------------

const dbState = {
	device: null as Record<string, unknown> | null,
	insertedCmd: null as Record<string, unknown> | null,
	/** Sequence of statuses returned per poll. Last entry is repeated. */
	statusSequence: ["pending"] as string[],
	pollIndex: 0,
	updateCalled: false,
};

function resetDbState() {
	dbState.device = null;
	dbState.insertedCmd = null;
	dbState.statusSequence = ["pending"];
	dbState.pollIndex = 0;
	dbState.updateCalled = false;
}

// ---------------------------------------------------------------------------
// Mock modules (must be registered before the dynamic import)
// ---------------------------------------------------------------------------

const DEVICE_PRESENCE = Symbol("devicePresence");
const AGENT_COMMANDS = Symbol("agentCommands");

mock.module("@superset/db/schema", () => ({
	devicePresence: DEVICE_PRESENCE,
	agentCommands: AGENT_COMMANDS,
}));

mock.module("drizzle-orm", () => ({
	eq: (..._: unknown[]) => ({}),
	and: (..._: unknown[]) => ({}),
	gt: (..._: unknown[]) => ({}),
}));

mock.module("@superset/db/client", () => ({
	db: {
		select: () => ({
			from: (table: unknown) => ({
				where: (..._: unknown[]) => ({
					limit: () => {
						if (table === DEVICE_PRESENCE) {
							return Promise.resolve(dbState.device ? [dbState.device] : []);
						}
						// agentCommands poll
						const seq = dbState.statusSequence;
						const idx = Math.min(dbState.pollIndex, seq.length - 1);
						const status = seq[idx];
						dbState.pollIndex++;
						return Promise.resolve([
							{
								id: dbState.insertedCmd?.id ?? "cmd-1",
								status,
								result: { answer: 42 },
								error: status === "failed" ? "tool error" : null,
							},
						]);
					},
				}),
			}),
		}),
		insert: (_table: unknown) => ({
			values: (_vals: unknown) => ({
				returning: () =>
					Promise.resolve(dbState.insertedCmd ? [dbState.insertedCmd] : []),
			}),
		}),
		update: (_table: unknown) => ({
			set: (_vals: unknown) => ({
				where: (..._: unknown[]) => {
					dbState.updateCalled = true;
					return Promise.resolve([]);
				},
			}),
		}),
	},
}));

// ---------------------------------------------------------------------------
// Module under test — loaded after mocks are in place
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: dynamic import for testability
let executeOnDevice: (...args: any[]) => Promise<any>;

beforeAll(async () => {
	({ executeOnDevice } = await import("./utils"));
});

const ctx = { userId: "user-1", organizationId: "org-1" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("executeOnDevice", () => {
	describe("device not online", () => {
		test("returns an error immediately when devicePresence is empty", async () => {
			resetDbState();
			dbState.device = null; // no device found

			const result = await executeOnDevice({
				ctx,
				deviceId: "device-a",
				tool: "list_workspaces",
				params: {},
				timeout: 500,
			});

			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("not online");
		});
	});

	describe("device belongs to a different user", () => {
		test("returns an ownership error", async () => {
			resetDbState();
			dbState.device = {
				id: "row-1",
				deviceId: "device-b",
				userId: "other-user", // ← different user
				organizationId: "org-1",
				deviceType: "desktop",
				deviceName: "Alice's Mac",
				lastSeenAt: new Date(),
			};
			dbState.insertedCmd = { id: "cmd-1" };

			const result = await executeOnDevice({
				ctx, // userId: "user-1"
				deviceId: "device-b",
				tool: "list_workspaces",
				params: {},
				timeout: 500,
			});

			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("does not belong to you");
		});
	});

	describe("command insert fails", () => {
		test("returns an error when insert returns no row", async () => {
			resetDbState();
			dbState.device = {
				id: "row-1",
				deviceId: "device-c",
				userId: "user-1",
				organizationId: "org-1",
				deviceType: "desktop",
				deviceName: "Test Mac",
				lastSeenAt: new Date(),
			};
			dbState.insertedCmd = null; // insert returns []

			const result = await executeOnDevice({
				ctx,
				deviceId: "device-c",
				tool: "list_workspaces",
				params: {},
				timeout: 500,
			});

			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("Failed to create command");
		});
	});

	describe("desktop picks up the command", () => {
		test("returns success when command status becomes 'completed'", async () => {
			resetDbState();
			dbState.device = {
				id: "row-1",
				deviceId: "device-d",
				userId: "user-1",
				organizationId: "org-1",
				deviceType: "desktop",
				deviceName: "Test Mac",
				lastSeenAt: new Date(),
			};
			dbState.insertedCmd = { id: "cmd-2" };
			// First poll returns "pending", second returns "completed"
			dbState.statusSequence = ["pending", "completed"];

			const result = await executeOnDevice({
				ctx,
				deviceId: "device-d",
				tool: "list_workspaces",
				params: {},
				timeout: 2000,
			});

			expect(result.isError).toBeUndefined();
			expect(result.content[0].text).toContain("42");
		});

		test("returns an error when command status becomes 'failed'", async () => {
			resetDbState();
			dbState.device = {
				id: "row-1",
				deviceId: "device-e",
				userId: "user-1",
				organizationId: "org-1",
				deviceType: "desktop",
				deviceName: "Test Mac",
				lastSeenAt: new Date(),
			};
			dbState.insertedCmd = { id: "cmd-3" };
			dbState.statusSequence = ["pending", "failed"];

			const result = await executeOnDevice({
				ctx,
				deviceId: "device-e",
				tool: "list_workspaces",
				params: {},
				timeout: 2000,
			});

			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("tool error");
		});
	});

	describe("desktop never responds — reproduces issue #2114", () => {
		// This is the core bug scenario: the command is created in the database
		// but the desktop app never updates its status (because Electric SQL
		// does not deliver the command to the desktop). The server polls for
		// the full timeout window and then returns a timeout error.
		test("times out after the specified timeout when desktop never responds", async () => {
			resetDbState();
			dbState.device = {
				id: "row-1",
				deviceId: "device-f",
				userId: "user-1",
				organizationId: "org-1",
				deviceType: "desktop",
				deviceName: "Test Mac",
				lastSeenAt: new Date(),
			};
			dbState.insertedCmd = { id: "cmd-4" };
			// Desktop never changes status — all polls return "pending"
			dbState.statusSequence = ["pending"];

			const start = Date.now();
			const result = await executeOnDevice({
				ctx,
				deviceId: "device-f",
				tool: "list_workspaces",
				params: {},
				timeout: 600, // short timeout for test speed
			});
			const elapsed = Date.now() - start;

			// Must have timed out
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("timed out");

			// Must have waited approximately the timeout window
			expect(elapsed).toBeGreaterThanOrEqual(500);

			// Must have attempted to mark command as timeout in the DB
			expect(dbState.updateCalled).toBe(true);
		});

		test("returns early when desktop sets status to 'timeout' (clock-skew scenario)", async () => {
			// If the desktop's clock is ahead of the server's by more than the
			// timeout window, the desktop's useCommandWatcher pre-expires the
			// command and sets its status to "timeout" before executing it.
			// The server should detect this on the next poll and return immediately
			// rather than waiting the full timeout window.
			resetDbState();
			dbState.device = {
				id: "row-1",
				deviceId: "device-g",
				userId: "user-1",
				organizationId: "org-1",
				deviceType: "desktop",
				deviceName: "Test Mac",
				lastSeenAt: new Date(),
			};
			dbState.insertedCmd = { id: "cmd-5" };
			// Desktop immediately marks the command as "timeout"
			dbState.statusSequence = ["timeout"];

			const start = Date.now();
			const result = await executeOnDevice({
				ctx,
				deviceId: "device-g",
				tool: "list_workspaces",
				params: {},
				timeout: 5000, // long window — should NOT be reached
			});
			const elapsed = Date.now() - start;

			// Must still return a timeout error
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("timed out");

			// Fix: server must return well before the 5 s timeout
			expect(elapsed).toBeLessThan(2000);
		});
	});
});
