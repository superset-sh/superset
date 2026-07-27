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

const showErrorBoxMock = mock(() => {});

mock.module("electron", () => ({
	app: {
		getVersion: () => APP_VERSION,
		isPackaged: false,
		getAppPath: () => "/tmp/app",
	},
	dialog: {
		showErrorBox: showErrorBoxMock,
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

const { HOST_SERVICE_RESPAWN_MAX_ATTEMPTS } = await import(
	"./host-service-respawn"
);
const { HostServiceCoordinator } = await import("./host-service-coordinator");

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
	showErrorBoxMock.mockClear();
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

describe("HostServiceCoordinator respawn after a crash", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;
	let internals: {
		instances: Map<string, unknown>;
		respawns: Map<
			string,
			{ attempts: number; timer: unknown; stableTimer: unknown }
		>;
		handleChildExit(
			organizationId: string,
			childPid: number,
			code: number | null,
			signal: NodeJS.Signals | null,
		): void;
	};
	let startMock: ReturnType<typeof mock>;
	/**
	 * Respawn delays are captured rather than slept through: the production jitter
	 * band would otherwise leak a random real-time wait into every timing test.
	 * `flushRespawn` runs the pending callback and lets its awaits settle.
	 */
	let pendingRespawns: Array<{ run: () => void; delayMs: number }>;

	async function flushRespawn(): Promise<void> {
		const next = pendingRespawns.shift();
		if (!next) throw new Error("no respawn was scheduled");
		next.run();
		await Promise.resolve();
		await Promise.resolve();
	}

	/** A running, owned instance, as the exit handler expects to find one. */
	function trackRunning(pid: number): void {
		internals.instances.set("org-1", {
			pid,
			port: 55555,
			secret: "secret",
			status: "running",
			owned: true,
		});
	}

	beforeEach(() => {
		resetMocks();
		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));
		coordinator = new HostServiceCoordinator();
		internals = coordinator as unknown as typeof internals;
		pendingRespawns = [];
		(
			coordinator as unknown as {
				scheduleRespawnTimer: (
					run: () => void,
					delayMs: number,
				) => ReturnType<typeof setTimeout>;
			}
		).scheduleRespawnTimer = (run, delayMs) => {
			pendingRespawns.push({ run, delayMs });
			return { unref() {} } as unknown as ReturnType<typeof setTimeout>;
		};
		// Registers a running instance like the real start path, so the stability
		// timer has something to bind its budget reset to.
		startMock = mock(async () => {
			internals.instances.set("org-1", {
				pid: 60001,
				port: 60000,
				secret: "fresh",
				status: "running",
				owned: true,
			});
			return { port: 60000, secret: "fresh", machineId: "host-1" };
		});
		(
			coordinator as unknown as { startWithPreferredPorts: typeof startMock }
		).startWithPreferredPorts = startMock;
		coordinator.setConfigProvider(async () => spawnConfig);
	});

	afterEach(() => {
		coordinator.stopAll();
		if (testManifestRoot) {
			fs.rmSync(testManifestRoot, { recursive: true, force: true });
			testManifestRoot = "";
		}
	});

	test("schedules a respawn when a running child crashes", () => {
		trackRunning(1111);

		internals.handleChildExit("org-1", 1111, null, "SIGKILL");

		expect(internals.respawns.get("org-1")?.attempts).toBe(1);
		expect(internals.respawns.get("org-1")?.timer).not.toBeNull();
		// The crash alone must not nag: the modal is for exhaustion only.
		expect(showErrorBoxMock).not.toHaveBeenCalled();
	});

	test("respawns through the start path once the delay elapses", async () => {
		trackRunning(1111);

		internals.handleChildExit("org-1", 1111, null, "SIGKILL");
		await flushRespawn();

		expect(startMock).toHaveBeenCalled();
	});

	test("schedules within the jittered first band", () => {
		trackRunning(1111);

		internals.handleChildExit("org-1", 1111, null, "SIGKILL");

		const delay = pendingRespawns[0]?.delayMs as number;
		expect(delay).toBeGreaterThanOrEqual(500);
		expect(delay).toBeLessThanOrEqual(1500);
	});

	test("does not respawn after a deliberate stop", () => {
		trackRunning(2222);
		coordinator.stop("org-1");

		// stop() marks the instance stopped and deletes it; a late exit event for
		// the same pid must be inert.
		internals.handleChildExit("org-1", 2222, 0, null);

		expect(internals.respawns.has("org-1")).toBe(false);
	});

	test("ignores a stale exit whose pid was already replaced", () => {
		trackRunning(3333);

		internals.handleChildExit("org-1", 9999, null, "SIGKILL");

		expect(internals.respawns.has("org-1")).toBe(false);
		expect(internals.instances.get("org-1")).toBeDefined();
	});

	test("does not respawn a child that never reached running", () => {
		internals.instances.set("org-1", {
			pid: 4444,
			port: 55555,
			secret: "secret",
			status: "starting",
			owned: true,
		});

		internals.handleChildExit("org-1", 4444, 1, null);

		// Startup deaths surface through start() rejecting instead.
		expect(internals.respawns.has("org-1")).toBe(false);
		expect(showErrorBoxMock).not.toHaveBeenCalled();
	});

	test("stop cancels a pending respawn so quitting cannot resurrect it", () => {
		trackRunning(5555);
		internals.handleChildExit("org-1", 5555, null, "SIGKILL");
		expect(internals.respawns.get("org-1")?.timer).not.toBeNull();

		coordinator.stop("org-1");

		expect(internals.respawns.has("org-1")).toBe(false);
	});

	test("stopAll cancels a pending respawn with no tracked instance", () => {
		trackRunning(6666);
		internals.handleChildExit("org-1", 6666, null, "SIGKILL");
		// The crashed instance is already deleted, so stopAll's loop over
		// `instances` cannot reach this org.
		expect(internals.instances.get("org-1")).toBeUndefined();

		coordinator.stopAll();

		expect(internals.respawns.has("org-1")).toBe(false);
	});

	test("gives up and alerts once the attempt budget is spent", () => {
		trackRunning(7777);
		const state = {
			attempts: HOST_SERVICE_RESPAWN_MAX_ATTEMPTS,
			timer: null,
			stableTimer: null,
		};
		internals.respawns.set("org-1", state);

		internals.handleChildExit("org-1", 7777, null, "SIGKILL");

		expect(showErrorBoxMock).toHaveBeenCalledTimes(1);
		expect(internals.respawns.has("org-1")).toBe(false);
	});

	test("retries rather than giving up when no config comes back", async () => {
		// loadToken returns null for a failed read or decrypt too, not only for a
		// signed-out user, so abandoning recovery here would strand a transient
		// failure. Deliberate sign-out tears the service down through stopAll.
		coordinator.setConfigProvider(async () => null);
		trackRunning(8888);

		internals.handleChildExit("org-1", 8888, null, "SIGKILL");
		await flushRespawn();

		expect(startMock).not.toHaveBeenCalled();
		expect(internals.respawns.get("org-1")?.attempts).toBe(2);
		expect(pendingRespawns).toHaveLength(1);
		expect(showErrorBoxMock).not.toHaveBeenCalled();
	});

	test("abandons an in-flight respawn when stopped while reading config", async () => {
		// Cancelling the timer cannot help once it has fired: without an identity
		// check the start below lands after teardown and leaves a child running.
		let releaseConfig: () => void = () => {};
		coordinator.setConfigProvider(
			() =>
				new Promise((resolve) => {
					releaseConfig = () => resolve(spawnConfig);
				}),
		);
		trackRunning(9101);
		internals.handleChildExit("org-1", 9101, null, "SIGKILL");

		const scheduled = pendingRespawns.shift();
		scheduled?.run(); // fires, then parks on the config promise
		coordinator.stopAll();
		releaseConfig();
		await Promise.resolve();
		await Promise.resolve();

		expect(startMock).not.toHaveBeenCalled();
	});

	test("refills the budget once the respawned instance holds", async () => {
		trackRunning(9200);
		internals.handleChildExit("org-1", 9200, null, "SIGKILL");
		await flushRespawn(); // respawn; startMock registers the new instance

		await flushRespawn(); // the stability timer

		expect(internals.respawns.has("org-1")).toBe(false);
	});

	test("does not refill the budget for a different instance", async () => {
		// The reset must be credited to the instance that earned it. Checking only
		// "something is running" would let this refill on an unrelated child,
		// including an adopted one owned by another app instance.
		trackRunning(9210);
		internals.handleChildExit("org-1", 9210, null, "SIGKILL");
		await flushRespawn();

		const stability = pendingRespawns.shift();
		internals.instances.set("org-1", {
			pid: 9299,
			port: 55555,
			secret: "secret",
			status: "running",
			owned: false, // a foreign, adopted instance replaced ours
		});
		stability?.run();

		expect(internals.respawns.has("org-1")).toBe(true);
	});

	test("tears the child back down when stopped while starting", async () => {
		let releaseStart: () => void = () => {};
		startMock = mock(
			() =>
				new Promise((resolve) => {
					releaseStart = () =>
						resolve({ port: 60000, secret: "fresh", machineId: "host-1" });
				}),
		);
		(
			coordinator as unknown as { startWithPreferredPorts: typeof startMock }
		).startWithPreferredPorts = startMock;
		const stopSpy = mock(() => {});
		trackRunning(9102);
		internals.handleChildExit("org-1", 9102, null, "SIGKILL");

		const scheduled = pendingRespawns.shift();
		scheduled?.run();
		await Promise.resolve();
		coordinator.stopAll();
		(coordinator as unknown as { stop: typeof stopSpy }).stop = stopSpy;
		releaseStart();
		await Promise.resolve();
		await Promise.resolve();

		// The freshly started child must not be left running past teardown.
		expect(stopSpy).toHaveBeenCalledWith("org-1");
	});
});

afterAll(() => {
	mock.restore();
});
