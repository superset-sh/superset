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
	} | null;
} = { current: null };

let testManifestRoot = "";

const readManifestMock = mock(() => manifestStore.current);
const removeManifestMock = mock(() => {
	manifestStore.current = null;
});
const isProcessAliveMock = mock(() => true);
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
	dialog: {
		showErrorBox: mock(),
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

const { HostServiceCoordinator, HEALTH_WATCHDOG_FAILURE_THRESHOLD } =
	await import("./host-service-coordinator");

const baseManifest = (pid: number, endpoint = "http://127.0.0.1:55555") => ({
	pid,
	endpoint,
	authToken: "manifest-secret",
	startedAt: 0,
	organizationId: "org-1",
});

const spawnConfig = { authToken: "token", cloudApiUrl: "https://api.example" };

interface HostServiceCoordinatorInternals {
	getPreferredPorts(organizationId: string): number[];
	rememberPort(organizationId: string, port: number): void;
}

function resetMocks(): void {
	manifestStore.current = null;
	readManifestMock.mockClear();
	removeManifestMock.mockClear();
	isProcessAliveMock.mockClear();
	isProcessAliveMock.mockImplementation(() => true);
	killProcessMock.mockClear();
	pollHealthCheckMock.mockClear();
	pollHealthCheckMock.mockImplementation(() => Promise.resolve(true));
	readManifestMock.mockClear();
	readManifestMock.mockImplementation(() => manifestStore.current);
	killedPids = [];
	killProcessError = null;
}

describe("HostServiceCoordinator preferred ports", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;

	beforeEach(() => {
		resetMocks();
		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));
		coordinator = new HostServiceCoordinator();
	});

	afterEach(() => {
		coordinator.stopAll();
		if (testManifestRoot) {
			fs.rmSync(testManifestRoot, { recursive: true, force: true });
			testManifestRoot = "";
		}
	});

	test("prefers the last known port, then a stable org port", () => {
		const internals = coordinator as unknown as HostServiceCoordinatorInternals;
		internals.rememberPort("org-1", 46666);

		const ports = internals.getPreferredPorts("org-1");

		expect(ports[0]).toBe(46666);
		expect(ports[1]).toBeGreaterThanOrEqual(48_000);
		expect(ports[1]).toBeLessThan(49_000);
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
		resetMocks();
		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));

		coordinator = new HostServiceCoordinator();
		spawnMock = mock(async () => ({
			port: 60000,
			secret: "fresh-secret",
			machineId: "host-1",
		}));
		(coordinator as unknown as { spawn: typeof spawnMock }).spawn = spawnMock;
	});

	afterEach(() => {
		coordinator.stopAll();
		if (testManifestRoot) {
			fs.rmSync(testManifestRoot, { recursive: true, force: true });
			testManifestRoot = "";
		}
	});

	test("removes manifest, SIGKILLs live pid, then spawns fresh", async () => {
		manifestStore.current = baseManifest(8888);

		const conn = await coordinator.reset("org-1", spawnConfig);

		expect(killedPids).toContainEqual({ pid: 8888, signal: "SIGKILL" });
		expect(removeManifestMock).toHaveBeenCalled();
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
		expect(conn.secret).toBe("fresh-secret");
	});

	test("swallows SIGKILL ESRCH (pid already gone) and still respawns", async () => {
		manifestStore.current = baseManifest(7777);
		const err: NodeJS.ErrnoException = new Error("kill ESRCH");
		err.code = "ESRCH";
		killProcessError = err;

		const conn = await coordinator.reset("org-1", spawnConfig);

		expect(killProcessMock).toHaveBeenCalledWith(7777, "SIGKILL");
		expect(removeManifestMock).toHaveBeenCalled();
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});

	test("is safe when no manifest exists — no kill, still spawns", async () => {
		manifestStore.current = null;

		const conn = await coordinator.reset("org-1", spawnConfig);

		expect(killedPids).toHaveLength(0);
		// removeManifest is called unconditionally — that's fine, the impl
		// in host-service-manifest treats a missing file as a no-op.
		expect(removeManifestMock).toHaveBeenCalled();
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});

	test("skips SIGKILL when the manifest pid is no longer alive", async () => {
		manifestStore.current = baseManifest(9999);
		isProcessAliveMock.mockImplementationOnce(() => false);

		const conn = await coordinator.reset("org-1", spawnConfig);

		expect(killedPids).toHaveLength(0);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});
});

interface AdoptableInternals {
	instances: Map<
		string,
		{
			pid: number;
			port: number;
			secret: string;
			status: string;
			owned: boolean;
		}
	>;
	spawn: ReturnType<typeof mock>;
}

describe("HostServiceCoordinator single-flight / adoption", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;
	let spawnMock: ReturnType<typeof mock>;

	beforeEach(() => {
		resetMocks();
		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));
		coordinator = new HostServiceCoordinator();
		spawnMock = mock(async () => ({
			port: 60000,
			secret: "fresh-secret",
			machineId: "host-1",
		}));
		(coordinator as unknown as AdoptableInternals).spawn = spawnMock;
	});

	afterEach(() => {
		coordinator.stopAll();
		if (testManifestRoot) {
			fs.rmSync(testManifestRoot, { recursive: true, force: true });
			testManifestRoot = "";
		}
	});

	test("adopts a healthy foreign host-service instead of spawning", async () => {
		manifestStore.current = baseManifest(4321, "http://127.0.0.1:55555");
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(true));

		const conn = await coordinator.start("org-1", spawnConfig);

		expect(spawnMock).not.toHaveBeenCalled();
		expect(conn.port).toBe(55555);
		expect(conn.secret).toBe("manifest-secret");

		const internals = coordinator as unknown as AdoptableInternals;
		expect(internals.instances.get("org-1")?.owned).toBe(false);
	});

	test("spawns when the manifest health-check fails", async () => {
		manifestStore.current = baseManifest(4321, "http://127.0.0.1:55555");
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));

		const conn = await coordinator.start("org-1", spawnConfig);

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});

	test("under-lock double-check adopts a manifest that appears after the first miss", async () => {
		manifestStore.current = baseManifest(4321, "http://127.0.0.1:55555");
		// Outer adopt attempt sees nothing; the re-check under the lock does.
		readManifestMock.mockImplementationOnce(() => null);
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(true));

		const conn = await coordinator.start("org-1", spawnConfig);

		expect(spawnMock).not.toHaveBeenCalled();
		expect(conn.port).toBe(55555);
	});

	test("adopted fast-path drops a dead foreign entry and re-spawns", async () => {
		const internals = coordinator as unknown as AdoptableInternals;
		internals.instances.set("org-1", {
			pid: 4321,
			port: 55555,
			secret: "manifest-secret",
			status: "running",
			owned: false,
		});
		manifestStore.current = null;
		isProcessAliveMock.mockImplementation(() => false);

		const conn = await coordinator.start("org-1", spawnConfig);

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});

	test("stop on an adopted entry does not SIGTERM and keeps the manifest", () => {
		const internals = coordinator as unknown as AdoptableInternals;
		internals.instances.set("org-1", {
			pid: 4321,
			port: 55555,
			secret: "manifest-secret",
			status: "running",
			owned: false,
		});

		coordinator.stop("org-1");

		expect(killedPids).toHaveLength(0);
		expect(removeManifestMock).not.toHaveBeenCalled();
		expect(internals.instances.get("org-1")).toBeUndefined();
	});

	test("stop on an owned entry SIGTERMs the child and removes the manifest", () => {
		const internals = coordinator as unknown as AdoptableInternals;
		internals.instances.set("org-1", {
			pid: 4321,
			port: 55555,
			secret: "own-secret",
			status: "running",
			owned: true,
		});

		coordinator.stop("org-1");

		expect(killedPids).toContainEqual({ pid: 4321, signal: "SIGTERM" });
		expect(removeManifestMock).toHaveBeenCalled();
		expect(internals.instances.get("org-1")).toBeUndefined();
	});
});

describe("HostServiceCoordinator health watchdog", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;
	let spawnMock: ReturnType<typeof mock>;

	type WatchdogStatus = "starting" | "running" | "stopped";

	interface WatchdogInternals {
		instances: Map<
			string,
			{
				pid: number;
				port: number;
				secret: string;
				status: WatchdogStatus;
				owned: boolean;
			}
		>;
		watchdogFailures: Map<string, { pid: number; count: number }>;
		runWatchdogTick(
			configProvider: () => Promise<{
				authToken: string;
				cloudApiUrl: string;
			} | null>,
		): Promise<void>;
	}

	const configProvider = async () => spawnConfig;
	const nullConfigProvider = async () => null;

	function internals(): WatchdogInternals {
		return coordinator as unknown as WatchdogInternals;
	}

	function seedInstance(
		organizationId: string,
		overrides: Partial<{
			pid: number;
			port: number;
			secret: string;
			status: WatchdogStatus;
			owned: boolean;
		}> = {},
	) {
		internals().instances.set(organizationId, {
			pid: 1234,
			port: 48123,
			secret: "secret",
			status: "running",
			// The watchdog only supervises children this instance owns; adopted
			// entries are another instance's responsibility.
			owned: true,
			...overrides,
		});
	}

	async function runTicks(
		count: number,
		provider: () => Promise<{
			authToken: string;
			cloudApiUrl: string;
		} | null> = configProvider,
	) {
		for (let i = 0; i < count; i++) {
			await internals().runWatchdogTick(provider);
		}
	}

	beforeEach(() => {
		resetMocks();
		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(true));

		coordinator = new HostServiceCoordinator();
		spawnMock = mock(async () => ({
			port: 60000,
			secret: "fresh-secret",
			machineId: "host-1",
		}));
		(coordinator as unknown as { spawn: typeof spawnMock }).spawn = spawnMock;
	});

	afterEach(() => {
		coordinator.stopAll();
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(true));
		if (testManifestRoot) {
			fs.rmSync(testManifestRoot, { recursive: true, force: true });
			testManifestRoot = "";
		}
	});

	test("healthy instance clears the failure counter and is never restarted", async () => {
		seedInstance("org-1");
		internals().watchdogFailures.set("org-1", { pid: 1234, count: 2 });

		await runTicks(1);

		expect(internals().watchdogFailures.has("org-1")).toBe(false);
		expect(spawnMock).not.toHaveBeenCalled();
		expect(killedPids).toHaveLength(0);
	});

	test("does not restart before the failure threshold", async () => {
		seedInstance("org-1");
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));

		await runTicks(HEALTH_WATCHDOG_FAILURE_THRESHOLD - 1);

		expect(internals().watchdogFailures.get("org-1")).toEqual({
			pid: 1234,
			count: HEALTH_WATCHDOG_FAILURE_THRESHOLD - 1,
		});
		expect(spawnMock).not.toHaveBeenCalled();
		expect(killedPids).toHaveLength(0);
	});

	test("force-restarts after consecutive failures reach the threshold", async () => {
		seedInstance("org-1", { pid: 4321 });
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));

		await runTicks(HEALTH_WATCHDOG_FAILURE_THRESHOLD);

		expect(spawnMock).toHaveBeenCalledTimes(1);
		// stop() SIGTERMs the tracked pid, then the watchdog escalates to
		// SIGKILL because the wedged process is still alive.
		expect(killedPids).toContainEqual({ pid: 4321, signal: "SIGTERM" });
		expect(killedPids).toContainEqual({ pid: 4321, signal: "SIGKILL" });
		expect(internals().watchdogFailures.has("org-1")).toBe(false);
	});

	test("stays armed when no spawn config is available and recovers on the next tick", async () => {
		seedInstance("org-1", { pid: 4321 });
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));

		await runTicks(HEALTH_WATCHDOG_FAILURE_THRESHOLD, nullConfigProvider);

		expect(spawnMock).not.toHaveBeenCalled();
		expect(killedPids).toHaveLength(0);
		// The counter survives the missing config, so recovery does not have
		// to wait out another full threshold once a config is available.
		expect(internals().watchdogFailures.get("org-1")?.count).toBe(
			HEALTH_WATCHDOG_FAILURE_THRESHOLD,
		);

		await runTicks(1);

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(killedPids).toContainEqual({ pid: 4321, signal: "SIGKILL" });
		expect(internals().watchdogFailures.has("org-1")).toBe(false);
	});

	test("skips the restart when the child is replaced while fetching config", async () => {
		seedInstance("org-1", { pid: 1111 });
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));
		const replacingProvider = async () => {
			// Simulate a manual restart landing while the config was fetched.
			seedInstance("org-1", { pid: 2222 });
			return spawnConfig;
		};

		await runTicks(HEALTH_WATCHDOG_FAILURE_THRESHOLD, replacingProvider);

		expect(spawnMock).not.toHaveBeenCalled();
		expect(killedPids).toHaveLength(0);
		expect(internals().watchdogFailures.has("org-1")).toBe(false);
	});

	test("ignores instances that are not running", async () => {
		seedInstance("org-1", { status: "starting" });

		await runTicks(1);

		expect(pollHealthCheckMock).not.toHaveBeenCalled();
		expect(spawnMock).not.toHaveBeenCalled();
	});

	test("ignores adopted instances it does not own", async () => {
		// An adopted entry points at another live app instance's child. Even if
		// it stops responding, force-restarting it would SIGKILL a process this
		// instance doesn't control — the owner runs its own watchdog.
		seedInstance("org-1", { pid: 4321, owned: false });
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));

		await runTicks(HEALTH_WATCHDOG_FAILURE_THRESHOLD + 1);

		expect(pollHealthCheckMock).not.toHaveBeenCalled();
		expect(killedPids).toHaveLength(0);
		expect(spawnMock).not.toHaveBeenCalled();
		expect(internals().watchdogFailures.has("org-1")).toBe(false);
	});

	test("a probe failure does not count against a replaced child", async () => {
		seedInstance("org-1", { pid: 1111 });
		pollHealthCheckMock.mockImplementation(() => {
			// Simulate a restart landing while the probe was in flight.
			seedInstance("org-1", { pid: 2222 });
			return Promise.resolve(false);
		});

		await runTicks(1);

		expect(internals().watchdogFailures.has("org-1")).toBe(false);
		expect(spawnMock).not.toHaveBeenCalled();
	});

	test("failure counter rebinds when a new child replaces the old one between ticks", async () => {
		seedInstance("org-1", { pid: 1111 });
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));

		await runTicks(HEALTH_WATCHDOG_FAILURE_THRESHOLD - 1);
		expect(internals().watchdogFailures.get("org-1")?.count).toBe(
			HEALTH_WATCHDOG_FAILURE_THRESHOLD - 1,
		);

		// A new child spawned between ticks must not inherit its
		// predecessor's failures and get restarted on its first bad probe.
		seedInstance("org-1", { pid: 2222 });
		await runTicks(1);

		expect(internals().watchdogFailures.get("org-1")).toEqual({
			pid: 2222,
			count: 1,
		});
		expect(spawnMock).not.toHaveBeenCalled();
		expect(killedPids).toHaveLength(0);
	});

	test("escalates the wedged pid to SIGKILL before the replacement spawns", async () => {
		seedInstance("org-1", { pid: 4321 });
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));
		// If the SIGKILL only landed after reset() returned, a slow spawn
		// would leave a window where the OS recycles the pid and the kill
		// hits an innocent process.
		let sigkilledBeforeSpawn = false;
		spawnMock.mockImplementation(async () => {
			sigkilledBeforeSpawn = killedPids.some(
				(k) => k.pid === 4321 && k.signal === "SIGKILL",
			);
			return { port: 60000, secret: "fresh-secret", machineId: "host-1" };
		});

		await runTicks(HEALTH_WATCHDOG_FAILURE_THRESHOLD);

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(sigkilledBeforeSpawn).toBe(true);
	});

	test("a failed recovery is retried until a spawn sticks", async () => {
		seedInstance("org-1", { pid: 4321 });
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));
		spawnMock.mockImplementationOnce(async () => {
			throw new Error("spawn blew up");
		});

		await runTicks(HEALTH_WATCHDOG_FAILURE_THRESHOLD);

		// The failed reset() left no instance behind; the retry pass respawns
		// the org instead of forgetting it.
		expect(spawnMock).toHaveBeenCalledTimes(2);
		expect(internals().watchdogFailures.has("org-1")).toBe(false);
	});

	test("stays armed while respawns keep failing", async () => {
		seedInstance("org-1", { pid: 4321 });
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));
		spawnMock.mockImplementation(async () => {
			throw new Error("spawn keeps failing");
		});

		await runTicks(HEALTH_WATCHDOG_FAILURE_THRESHOLD + 1);

		expect(internals().watchdogFailures.get("org-1")?.count).toBe(
			HEALTH_WATCHDOG_FAILURE_THRESHOLD,
		);
		expect(spawnMock.mock.calls.length).toBeGreaterThanOrEqual(3);
	});

	test("stop() disarms the watchdog for that org", () => {
		internals().watchdogFailures.set("org-1", {
			pid: 1234,
			count: HEALTH_WATCHDOG_FAILURE_THRESHOLD,
		});

		coordinator.stop("org-1");

		expect(internals().watchdogFailures.has("org-1")).toBe(false);
	});

	test("retry pass aborts when the org is stopped while fetching config", async () => {
		internals().watchdogFailures.set("org-1", {
			pid: 4321,
			count: HEALTH_WATCHDOG_FAILURE_THRESHOLD,
		});
		const stoppingProvider = async () => {
			// A deliberate shutdown lands while the config is being fetched.
			coordinator.stop("org-1");
			return spawnConfig;
		};

		await runTicks(1, stoppingProvider);

		expect(spawnMock).not.toHaveBeenCalled();
		expect(internals().watchdogFailures.has("org-1")).toBe(false);
	});

	test("a rejecting config lookup fails the tick quietly", async () => {
		seedInstance("org-1", { pid: 4321 });
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));
		const rejectingProvider = async (): Promise<{
			authToken: string;
			cloudApiUrl: string;
		} | null> => {
			throw new Error("token lookup failed");
		};

		// The tick runs detached from a timer — it must swallow the rejection
		// instead of surfacing an unhandled rejection.
		await runTicks(HEALTH_WATCHDOG_FAILURE_THRESHOLD, rejectingProvider);

		expect(spawnMock).not.toHaveBeenCalled();
	});

	test("a spawn failure leaves no ghost 'starting' instance behind", async () => {
		// Use the real spawn() with a failing buildEnv — pre-fix, the instance
		// stayed tracked as "starting" forever, permanently blocking both
		// startWithPreferredPorts status readers and the watchdog retry pass.
		delete (coordinator as unknown as { spawn?: unknown }).spawn;
		(coordinator as unknown as { buildEnv: () => Promise<never> }).buildEnv =
			async () => {
				throw new Error("env resolution failed");
			};

		await expect(coordinator.start("org-1", spawnConfig)).rejects.toThrow(
			"env resolution failed",
		);

		expect(internals().instances.has("org-1")).toBe(false);
	});
});

afterAll(() => {
	mock.restore();
});
