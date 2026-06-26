import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApiClient } from "../api-client";

const originalFetch = globalThis.fetch;
const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const originalHostBin = process.env.SUPERSET_HOST_BIN;
const tempHome = mkdtempSync(join(tmpdir(), "superset-cli-spawn-"));
const hostBin = join(tempHome, "superset-host");

process.env.SUPERSET_HOME_DIR = tempHome;
process.env.SUPERSET_HOST_BIN = hostBin;
writeFileSync(hostBin, "");

type SpawnOptions = {
	env?: NodeJS.ProcessEnv;
	detached?: boolean;
	stdio?: unknown;
};

type FakeChild = EventEmitter & {
	pid: number | undefined;
	exitCode: number | null;
	signalCode: NodeJS.Signals | null;
	kill: (signal?: NodeJS.Signals | number) => boolean;
	unref: () => void;
};

type ChildOverrides = {
	pidless?: boolean;
	killResult?: boolean;
	emitOnSpawn?: {
		event: "exit" | "error";
		args: ReadonlyArray<unknown>;
	};
};

const spawnCalls: Array<{
	command: string;
	args: string[];
	options: SpawnOptions;
}> = [];

let nextChildOverrides: ChildOverrides = {};

function createFakeChild(overrides: ChildOverrides): FakeChild {
	const child = new EventEmitter() as FakeChild;
	child.pid = overrides.pidless ? undefined : 12345;
	child.exitCode = null;
	child.signalCode = null;
	child.kill = mock(() =>
		overrides.killResult === undefined ? true : overrides.killResult,
	);
	child.unref = mock(() => undefined);
	return child;
}

const spawnMock = mock(
	(command: string, args: string[], options: SpawnOptions) => {
		spawnCalls.push({ command, args, options });
		const overrides = nextChildOverrides;
		const child = createFakeChild(overrides);
		// Fire the requested event after the listener is wired up, but
		// before pollHealth makes its first fetch, so the test exercises
		// the early-exit / error path deterministically.
		if (overrides.emitOnSpawn) {
			const { event, args: emitArgs } = overrides.emitOnSpawn;
			queueMicrotask(() => child.emit(event, ...emitArgs));
		}
		return child;
	},
);

mock.module("node:child_process", () => ({
	spawn: spawnMock,
}));

const { SUPERSET_CONFIG_PATH } = await import("../config");
const { spawnHostService } = await import("./spawn");

function createApi(): ApiClient {
	return {
		analytics: {
			featureFlagPayload: {
				query: async () => null,
			},
		},
	} as unknown as ApiClient;
}

afterEach(() => {
	spawnCalls.length = 0;
	spawnMock.mockClear();
	nextChildOverrides = {};
	globalThis.fetch = originalFetch;
});

afterAll(() => {
	rmSync(tempHome, { recursive: true, force: true });
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
	if (originalHostBin === undefined) {
		delete process.env.SUPERSET_HOST_BIN;
	} else {
		process.env.SUPERSET_HOST_BIN = originalHostBin;
	}
});

describe("spawnHostService", () => {
	test("passes SUPERSET_AUTH_CONFIG_PATH when provided", async () => {
		globalThis.fetch = mock(
			async () => new Response("ok", { status: 200 }),
		) as unknown as typeof fetch;

		await spawnHostService({
			organizationId: "00000000-0000-0000-0000-000000000001",
			sessionToken: "session-token",
			authConfigPath: SUPERSET_CONFIG_PATH,
			api: createApi(),
			port: 54879,
			daemon: true,
		});

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(spawnCalls[0]?.options.env?.SUPERSET_AUTH_CONFIG_PATH).toBe(
			SUPERSET_CONFIG_PATH,
		);
		expect(spawnCalls[0]?.options.env?.AUTH_TOKEN).toBe("session-token");
	});

	test("throws with code/signal when child exits during startup", async () => {
		// Fetch never returns OK, so health polling never resolves true.
		globalThis.fetch = mock(
			async () => new Response("not ready", { status: 503 }),
		) as unknown as typeof fetch;

		// Spawn emits 'exit' once listeners are wired so pollHealth bails
		// via the early-exit predicate instead of running the full timeout.
		nextChildOverrides = {
			emitOnSpawn: { event: "exit", args: [137, "SIGKILL"] },
		};

		let thrown: unknown;
		try {
			await spawnHostService({
				organizationId: "00000000-0000-0000-0000-000000000002",
				sessionToken: "session-token",
				api: createApi(),
				port: 54880,
				daemon: true,
			});
		} catch (err) {
			thrown = err;
		}

		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).message).toContain("exited during startup");
		expect((thrown as Error).message).toContain("code=137");
		expect((thrown as Error).message).toContain("SIGKILL");
	});

	test("attaches an 'error' listener before the pid check", async () => {
		// When spawn fails (e.g. ENOENT), Node returns a child with no pid
		// and emits 'error' asynchronously. The listener has to be wired
		// up before the !pid throw, otherwise the trailing emit hits an
		// EventEmitter with no listener and Node terminates the process.
		// We verify the wiring by checking the listener count on the
		// returned child rather than trying to deterministically time the
		// emit.
		globalThis.fetch = mock(
			async () => new Response("ok", { status: 200 }),
		) as unknown as typeof fetch;

		nextChildOverrides = { pidless: true };

		let thrown: unknown;
		let listenerCount = 0;
		// Wrap the spawn mock so we can observe the listener count on the
		// returned child right after spawn returns. The error listener is
		// attached synchronously between spawn() and the pid check.
		const originalImpl = spawnMock.getMockImplementation();
		if (!originalImpl) throw new Error("expected mock impl");
		spawnMock.mockImplementation((command, args, options) => {
			const child = originalImpl(command, args, options) as FakeChild;
			queueMicrotask(() => {
				listenerCount = child.listenerCount("error");
			});
			return child;
		});

		try {
			await spawnHostService({
				organizationId: "00000000-0000-0000-0000-000000000003",
				sessionToken: "session-token",
				api: createApi(),
				port: 54881,
				daemon: true,
			});
		} catch (err) {
			thrown = err;
		}

		if (originalImpl) spawnMock.mockImplementation(originalImpl);
		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).message).toContain("Failed to spawn");
		expect(listenerCount).toBeGreaterThan(0);
	});

	test("terminateChild does not hang when kill() returns false", async () => {
		// Force kill() to return false so terminateChild's "process already
		// gone" fast-path runs. With the TDZ bug this path used to throw
		// ReferenceError because the timer handles weren't initialized
		// yet when finish() ran. We also emit 'exit' so pollHealth bails
		// fast via the early-exit predicate instead of running the full
		// 10s health-check timeout.
		nextChildOverrides = {
			killResult: false,
			emitOnSpawn: { event: "exit", args: [1, null] },
		};
		globalThis.fetch = mock(
			async () => new Response("not ready", { status: 503 }),
		) as unknown as typeof fetch;

		let thrown: unknown;
		try {
			await spawnHostService({
				organizationId: "00000000-0000-0000-0000-000000000004",
				sessionToken: "session-token",
				api: createApi(),
				port: 54882,
				daemon: true,
			});
		} catch (err) {
			thrown = err;
		}

		// The fix replaces a ReferenceError (TDZ on the timer handles)
		// with a clean exit-during-startup error.
		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).message).toContain("exited during startup");
	});
});
