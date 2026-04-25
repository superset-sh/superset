import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import * as actualChildProcess from "node:child_process";
import { EventEmitter } from "node:events";

interface SpawnOptions {
	detached?: boolean;
	stdio?: unknown;
	windowsHide?: boolean;
	env?: Record<string, string>;
}

interface SpawnCall {
	command: string;
	args: string[];
	options: SpawnOptions;
}

interface TestManifest {
	pid: number;
	endpoint: string;
	authToken: string;
	startedAt: number;
	organizationId: string;
}

const spawnCalls: SpawnCall[] = [];
const unrefMock = mock(() => {});
let currentManifest: TestManifest | null = null;
let manifestProcessAlive = false;
let hostInfoVersion = "0.2.0";

const originalFetch = globalThis.fetch;
const fetchMock = mock(() =>
	Promise.resolve(
		new Response(
			JSON.stringify({
				result: { data: { json: { version: hostInfoVersion } } },
			}),
			{ status: 200 },
		),
	),
);

class MockChildProcess extends EventEmitter {
	pid = 4242;
	stdout = new EventEmitter();
	stderr = new EventEmitter();
	unref = unrefMock;
	kill = mock(() => true);
}

const spawnMock = mock(
	(command: string, args: string[], options: SpawnOptions) => {
		spawnCalls.push({ command, args, options });
		return new MockChildProcess();
	},
);

mock.module("node:child_process", () => ({
	...actualChildProcess,
	spawn: spawnMock,
}));

mock.module("@superset/shared/device-info", () => ({
	getDeviceName: () => "Test Device",
	getHashedDeviceId: () => "test-machine-id",
}));

mock.module("../../lib/trpc/routers/workspaces/utils/shell-env", () => ({
	getProcessEnvWithShellPath: async (env: Record<string, string>) => env,
}));

mock.module("./host-service-manifest", () => ({
	isProcessAlive: () => manifestProcessAlive,
	listManifests: () => [],
	manifestDir: () => "/tmp/superset-host-service-test",
	readManifest: () => currentManifest,
	removeManifest: () => {},
}));

mock.module("./host-service-utils", () => ({
	findFreePort: async () => 45123,
	HEALTH_POLL_TIMEOUT_MS: 10_000,
	MAX_HOST_LOG_BYTES: 5 * 1024 * 1024,
	openRotatingLogFd: () => -1,
	pollHealthCheck: async () => true,
}));

const { HostServiceCoordinator } = await import("./host-service-coordinator");

describe("HostServiceCoordinator", () => {
	beforeEach(() => {
		spawnCalls.length = 0;
		currentManifest = null;
		manifestProcessAlive = false;
		hostInfoVersion = "0.2.0";
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		spawnMock.mockClear();
		unrefMock.mockClear();
		fetchMock.mockClear();
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	test("spawns host-service detached so v2 PTYs survive Electron restarts", async () => {
		const coordinator = new HostServiceCoordinator();

		await coordinator.start("org-1", {
			authToken: "auth-token",
			cloudApiUrl: "https://api.superset.test",
		});

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(spawnCalls[0]?.options.detached).toBe(true);
		expect(spawnCalls[0]?.options.stdio).toEqual([
			"ignore",
			"ignore",
			"ignore",
		]);
		expect(unrefMock).toHaveBeenCalledTimes(1);
	});

	test("adopts an existing superjson host.info service instead of killing it", async () => {
		currentManifest = {
			pid: 999_999,
			endpoint: "http://127.0.0.1:45123",
			authToken: "existing-secret",
			startedAt: Date.now(),
			organizationId: "org-1",
		};
		manifestProcessAlive = true;
		const coordinator = new HostServiceCoordinator();

		const connection = await coordinator.start("org-1", {
			authToken: "auth-token",
			cloudApiUrl: "https://api.superset.test",
		});

		expect(connection).toEqual({
			port: 45123,
			secret: "existing-secret",
			machineId: "test-machine-id",
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).not.toHaveBeenCalled();
	});

	test("rejects an adopted host-service below the minimum version and spawns a replacement", async () => {
		currentManifest = {
			pid: 999_999,
			endpoint: "http://127.0.0.1:45123",
			authToken: "old-secret",
			startedAt: Date.now(),
			organizationId: "org-1",
		};
		manifestProcessAlive = true;
		hostInfoVersion = "0.1.0";
		const coordinator = new HostServiceCoordinator();

		const connection = await coordinator.start("org-1", {
			authToken: "auth-token",
			cloudApiUrl: "https://api.superset.test",
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(spawnCalls[0]?.options.detached).toBe(true);
		expect(connection.port).toBe(45123);
		expect(connection.secret).not.toBe("old-secret");
	});
});
