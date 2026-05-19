import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";

const APP_VERSION = "1.2.3";
let killedPids: Array<{ pid: number; signal: NodeJS.Signals | number }> = [];
let killProcessError: NodeJS.ErrnoException | null = null;

const manifestStore: {
	current: {
		pid: number;
		endpoint: string;
		authToken: string;
		startedAt: number;
		organizationId: string;
		spawnedByAppVersion: string;
	} | null;
} = { current: null };

// Per-test temp dir backing the mocked `manifestDir`. A real path (not a
// fixed string) so tests stay isolated; assigned in beforeEach, removed in
// afterEach.
let testManifestRoot = "";

const readManifestMock = mock(() => manifestStore.current);
const removeManifestMock = mock(() => {
	manifestStore.current = null;
});
const isProcessAliveMock = mock(() => true);
const listManifestsMock = mock(
	() => [] as NonNullable<typeof manifestStore.current>[],
);
const killProcessMock = mock((pid: number, signal: NodeJS.Signals | number) => {
	if (killProcessError) {
		const error = killProcessError;
		killProcessError = null;
		throw error;
	}
	killedPids.push({ pid, signal });
});

const realHostServiceManifest = await import("./host-service-manifest");
mock.module("./host-service-manifest", () => ({
	...realHostServiceManifest,
	readManifest: readManifestMock,
	removeManifest: removeManifestMock,
	isProcessAlive: isProcessAliveMock,
	killProcess: killProcessMock,
	listManifests: listManifestsMock,
	manifestDir: (orgId: string) => path.join(testManifestRoot, orgId),
}));

const pollHealthCheckMock = mock(() => Promise.resolve(true));

const realHostServiceUtils = await import("./host-service-utils");
mock.module("./host-service-utils", () => ({
	...realHostServiceUtils,
	HEALTH_POLL_TIMEOUT_MS: 10_000,
	MAX_HOST_LOG_BYTES: 1024,
	findFreePort: mock(() => Promise.resolve(40000)),
	openRotatingLogFd: mock(() => -1),
	pollHealthCheck: pollHealthCheckMock,
}));

mock.module("electron", () => ({
	app: {
		getVersion: () => APP_VERSION,
		isPackaged: false,
		getAppPath: () => "/tmp/app",
	},
}));

mock.module("electron-log/main", () => ({
	default: {
		info: () => {},
		warn: () => {},
		error: () => {},
	},
}));

const realHostInfo = await import("@superset/shared/host-info");
mock.module("@superset/shared/host-info", () => ({
	...realHostInfo,
	getHostId: () => "host-1",
	getHostName: () => "host",
}));
mock.module("./local-db", () => ({
	localDb: {
		select: () => ({ from: () => ({ get: () => null }) }),
	},
}));

const { HostServiceCoordinator } = await import("./host-service-coordinator");

const baseManifest = (pid: number, endpoint = "http://127.0.0.1:55555") => ({
	pid,
	endpoint,
	authToken: "manifest-secret",
	startedAt: 0,
	organizationId: "org-1",
	spawnedByAppVersion: APP_VERSION,
});

const spawnConfig = { authToken: "token", cloudApiUrl: "https://api.example" };

interface HostServiceCoordinatorInternals {
	getPreferredPorts(organizationId: string): number[];
	rememberPort(organizationId: string, port: number): void;
}

describe("HostServiceCoordinator.tryAdopt — adoption health check", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;
	let spawnMock: ReturnType<typeof mock>;

	beforeEach(() => {
		manifestStore.current = null;
		readManifestMock.mockClear();
		removeManifestMock.mockClear();
		isProcessAliveMock.mockClear();
		listManifestsMock.mockClear();
		killProcessMock.mockClear();
		pollHealthCheckMock.mockClear();

		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));

		killedPids = [];
		killProcessError = null;

		coordinator = new HostServiceCoordinator();
		// Replace spawn so a failed adoption doesn't actually launch electron.
		spawnMock = mock(async () => ({
			port: 60000,
			secret: "fresh-secret",
			machineId: "host-1",
		}));
		(coordinator as unknown as { spawn: typeof spawnMock }).spawn = spawnMock;
	});

	afterEach(() => {
		coordinator.releaseAll();
		if (testManifestRoot) {
			fs.rmSync(testManifestRoot, { recursive: true, force: true });
			testManifestRoot = "";
		}
	});

	test("adopts when manifest is healthy", async () => {
		manifestStore.current = baseManifest(1234);
		pollHealthCheckMock.mockImplementationOnce(() => Promise.resolve(true));

		const conn = await coordinator.start("org-1", spawnConfig);

		expect(conn.port).toBe(55555);
		expect(conn.secret).toBe("manifest-secret");
		expect(pollHealthCheckMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).not.toHaveBeenCalled();
		expect(removeManifestMock).not.toHaveBeenCalled();
		expect(coordinator.getProcessStatus("org-1")).toBe("running");
	});

	test("kills the adopted pid with SIGKILL and falls through to spawn when health check fails", async () => {
		manifestStore.current = baseManifest(4321);
		pollHealthCheckMock.mockImplementationOnce(() => Promise.resolve(false));

		const conn = await coordinator.start("org-1", spawnConfig);

		expect(pollHealthCheckMock).toHaveBeenCalledTimes(1);
		expect(killedPids).toContainEqual({ pid: 4321, signal: "SIGKILL" });
		expect(removeManifestMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
		expect(conn.secret).toBe("fresh-secret");
	});

	test("swallows SIGKILL ESRCH (pid already gone) and still respawns", async () => {
		manifestStore.current = baseManifest(7777);
		pollHealthCheckMock.mockImplementationOnce(() => Promise.resolve(false));
		const err: NodeJS.ErrnoException = new Error("kill ESRCH");
		err.code = "ESRCH";
		killProcessError = err;

		const conn = await coordinator.start("org-1", spawnConfig);

		expect(killProcessMock).toHaveBeenCalledWith(7777, "SIGKILL");
		expect(removeManifestMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});

	test("kills and respawns when app-version changed even if the service is healthy", async () => {
		manifestStore.current = {
			...baseManifest(5555),
			spawnedByAppVersion: "0.9.0",
		};
		pollHealthCheckMock.mockImplementationOnce(() => Promise.resolve(true));

		const conn = await coordinator.start("org-1", spawnConfig);

		expect(pollHealthCheckMock).toHaveBeenCalledTimes(1);
		expect(killedPids).toContainEqual({ pid: 5555, signal: "SIGKILL" });
		expect(removeManifestMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
		expect(conn.secret).toBe("fresh-secret");
	});

	test("removes an unhealthy app-version mismatch without killing when health does not verify", async () => {
		manifestStore.current = {
			...baseManifest(5556),
			spawnedByAppVersion: "0.9.0",
		};
		pollHealthCheckMock.mockImplementationOnce(() => Promise.resolve(false));

		const conn = await coordinator.start("org-1", spawnConfig);

		expect(pollHealthCheckMock).toHaveBeenCalledTimes(1);
		expect(killedPids).toHaveLength(0);
		expect(removeManifestMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});

	test("kills and respawns a healthy pre-upgrade manifest with no recorded app version", async () => {
		manifestStore.current = {
			...baseManifest(5557),
			spawnedByAppVersion: "",
		};
		pollHealthCheckMock.mockImplementationOnce(() => Promise.resolve(true));

		const conn = await coordinator.start("org-1", spawnConfig);

		expect(pollHealthCheckMock).toHaveBeenCalledTimes(1);
		expect(killedPids).toContainEqual({ pid: 5557, signal: "SIGKILL" });
		expect(removeManifestMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
		expect(conn.secret).toBe("fresh-secret");
	});

	test("removes an unhealthy pre-upgrade manifest without killing when health does not verify", async () => {
		manifestStore.current = {
			...baseManifest(5558),
			spawnedByAppVersion: "",
		};
		pollHealthCheckMock.mockImplementationOnce(() => Promise.resolve(false));

		const conn = await coordinator.start("org-1", spawnConfig);

		expect(pollHealthCheckMock).toHaveBeenCalledTimes(1);
		expect(killedPids).toHaveLength(0);
		expect(removeManifestMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});
});

describe("HostServiceCoordinator preferred ports", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;

	beforeEach(() => {
		manifestStore.current = null;
		readManifestMock.mockClear();
		removeManifestMock.mockClear();
		isProcessAliveMock.mockClear();
		listManifestsMock.mockClear();
		killProcessMock.mockClear();
		pollHealthCheckMock.mockClear();

		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));
		coordinator = new HostServiceCoordinator();
	});

	afterEach(() => {
		coordinator.releaseAll();
		if (testManifestRoot) {
			fs.rmSync(testManifestRoot, { recursive: true, force: true });
			testManifestRoot = "";
		}
	});

	test("prefers the last known port, then the manifest port, then a stable org port", () => {
		manifestStore.current = baseManifest(1234, "http://127.0.0.1:45555");
		const internals = coordinator as unknown as HostServiceCoordinatorInternals;
		internals.rememberPort("org-1", 46666);

		const ports = internals.getPreferredPorts("org-1");

		expect(ports[0]).toBe(46666);
		expect(ports[1]).toBe(45555);
		expect(ports[2]).toBeGreaterThanOrEqual(48_000);
		expect(ports[2]).toBeLessThan(49_000);
	});

	test("uses a deterministic stable port when no previous port exists", () => {
		const internals = coordinator as unknown as HostServiceCoordinatorInternals;

		const ports = internals.getPreferredPorts("org-1");
		const secondRead = internals.getPreferredPorts("org-1");

		expect(ports).toEqual(secondRead);
		expect(ports).toHaveLength(1);
		expect(ports[0]).toBeGreaterThanOrEqual(48_000);
		expect(ports[0]).toBeLessThan(49_000);
	});
});

describe("HostServiceCoordinator.reset", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;
	let spawnMock: ReturnType<typeof mock>;

	beforeEach(() => {
		manifestStore.current = null;
		readManifestMock.mockClear();
		removeManifestMock.mockClear();
		isProcessAliveMock.mockClear();
		listManifestsMock.mockClear();
		killProcessMock.mockClear();
		pollHealthCheckMock.mockClear();

		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));

		killedPids = [];
		killProcessError = null;

		coordinator = new HostServiceCoordinator();
		spawnMock = mock(async () => ({
			port: 60000,
			secret: "fresh-secret",
			machineId: "host-1",
		}));
		(coordinator as unknown as { spawn: typeof spawnMock }).spawn = spawnMock;
	});

	afterEach(() => {
		coordinator.releaseAll();
		if (testManifestRoot) {
			fs.rmSync(testManifestRoot, { recursive: true, force: true });
			testManifestRoot = "";
		}
	});

	test("removes manifest, SIGKILLs live pid, then spawns fresh", async () => {
		manifestStore.current = baseManifest(8888);

		const conn = await coordinator.reset("org-1", spawnConfig);

		expect(killedPids).toContainEqual({ pid: 8888, signal: "SIGKILL" });
		expect(removeManifestMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
		expect(conn.secret).toBe("fresh-secret");
	});

	test("SIGKILLs the manifest pid even when an instance is tracked (stop's SIGTERM may not be enough)", async () => {
		// First adopt a healthy instance so it's tracked in `this.instances`.
		manifestStore.current = baseManifest(2468);
		pollHealthCheckMock.mockImplementationOnce(() => Promise.resolve(true));
		await coordinator.start("org-1", spawnConfig);
		expect(coordinator.getProcessStatus("org-1")).toBe("running");
		killedPids.length = 0;

		// Adoption leaves the manifest in place; reset must read its pid before
		// stop() removes it, then escalate SIGTERM → SIGKILL on a wedged process.
		const conn = await coordinator.reset("org-1", spawnConfig);

		expect(killedPids).toContainEqual({ pid: 2468, signal: "SIGTERM" });
		expect(killedPids).toContainEqual({ pid: 2468, signal: "SIGKILL" });
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});

	test("is safe when no manifest exists — no kill, still spawns", async () => {
		manifestStore.current = null;

		const conn = await coordinator.reset("org-1", spawnConfig);

		expect(killedPids).toHaveLength(0);
		// `removeManifest` is called unconditionally — that's fine, the impl
		// in host-service-manifest treats a missing file as a no-op.
		expect(removeManifestMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});
});

describe("HostServiceCoordinator.teardownKnownManifests", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;

	beforeEach(() => {
		manifestStore.current = null;
		readManifestMock.mockClear();
		removeManifestMock.mockClear();
		isProcessAliveMock.mockClear();
		listManifestsMock.mockClear();
		killProcessMock.mockClear();
		pollHealthCheckMock.mockClear();

		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));

		killedPids = [];
		killProcessError = null;
		coordinator = new HostServiceCoordinator();
	});

	afterEach(() => {
		coordinator.releaseAll();
		if (testManifestRoot) {
			fs.rmSync(testManifestRoot, { recursive: true, force: true });
			testManifestRoot = "";
		}
	});

	test("health-verifies manifest-backed services before killing", async () => {
		listManifestsMock.mockImplementationOnce(() => [
			baseManifest(9001),
			{
				...baseManifest(9002),
				organizationId: "org-2",
			},
		]);
		pollHealthCheckMock
			.mockImplementationOnce(() => Promise.resolve(true))
			.mockImplementationOnce(() => Promise.resolve(false));

		await coordinator.teardownKnownManifests();

		expect(killedPids).toContainEqual({ pid: 9001, signal: "SIGKILL" });
		expect(killedPids).not.toContainEqual({ pid: 9002, signal: "SIGKILL" });
		expect(removeManifestMock).toHaveBeenCalledWith("org-1");
		expect(removeManifestMock).toHaveBeenCalledWith("org-2");
		expect(readManifestMock).not.toHaveBeenCalled();
		expect(pollHealthCheckMock).toHaveBeenCalledTimes(2);
	});
});

afterAll(() => {
	mock.restore();
});
