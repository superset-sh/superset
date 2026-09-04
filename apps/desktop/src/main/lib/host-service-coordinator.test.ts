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

const showAlertMock = mock(async () => ({
	response: 0,
	checkboxChecked: false,
}));

// Keep every electron export name other suite files link against (e.g.
// browser-manager's webContents/clipboard/Menu): bun's mock.module can swap
// export values but cannot add names to an already-instantiated module
// record, so a narrower shape here breaks later files' imports.
mock.module("electron", () => ({
	app: {
		getVersion: () => APP_VERSION,
		isPackaged: false,
		getAppPath: () => "/tmp/app",
	},
	dialog: {
		showMessageBox: showAlertMock,
	},
	webContents: {
		fromId: mock(() => null),
	},
	clipboard: {
		writeText: mock(() => {}),
		writeImage: mock(() => {}),
	},
	Menu: {
		buildFromTemplate: mock(() => ({ popup: mock(() => {}) })),
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
		select: () => ({
			from: () => ({ get: () => null, where: () => ({ get: () => null }) }),
		}),
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
	showAlertMock.mockClear();
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

interface StableSecretInternals {
	getOrCreateSecret(organizationId: string): string;
}

describe("HostServiceCoordinator stable secret", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;
	let internals: StableSecretInternals;

	beforeEach(() => {
		resetMocks();
		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));
		coordinator = new HostServiceCoordinator();
		internals = coordinator as unknown as StableSecretInternals;
	});

	afterEach(() => {
		coordinator.stopAll();
		if (testManifestRoot) {
			fs.rmSync(testManifestRoot, { recursive: true, force: true });
			testManifestRoot = "";
		}
	});

	test("hands respawns the same secret clients already hold", () => {
		const first = internals.getOrCreateSecret("org-1");

		expect(internals.getOrCreateSecret("org-1")).toBe(first);
		expect(internals.getOrCreateSecret("org-2")).not.toBe(first);
	});

	test("seeds the secret from a surviving manifest, then keeps it", () => {
		manifestStore.current = baseManifest(1234);

		expect(internals.getOrCreateSecret("org-1")).toBe("manifest-secret");

		// Sticky once seeded: losing the manifest (crash cleanup) must not
		// rotate the credential out from under connected clients.
		manifestStore.current = null;
		expect(internals.getOrCreateSecret("org-1")).toBe("manifest-secret");
	});
});

interface ReconcileInternals {
	instances: Map<
		string,
		{
			pid: number;
			port: number;
			secret: string;
			status: "running";
			owned: boolean;
		}
	>;
	respawns: Map<string, unknown>;
}

describe("HostServiceCoordinator.reconcile", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;
	let internals: ReconcileInternals;

	beforeEach(() => {
		resetMocks();
		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));
		coordinator = new HostServiceCoordinator();
		internals = coordinator as unknown as ReconcileInternals;
	});

	afterEach(() => {
		coordinator.stopAll();
		if (testManifestRoot) {
			fs.rmSync(testManifestRoot, { recursive: true, force: true });
			testManifestRoot = "";
		}
	});

	test("starts only the unique organizations in the authenticated set", async () => {
		const startMock = mock(async (organizationId: string) => {
			internals.instances.set(organizationId, {
				pid: organizationId === "org-1" ? 1001 : 1002,
				port: 60_000,
				secret: "secret",
				status: "running",
				owned: true,
			});
			return { port: 60_000, secret: "secret", machineId: "host-1" };
		});
		coordinator.start = startMock;

		await coordinator.reconcile(["org-1", "org-2", "org-1"], spawnConfig);

		expect(startMock).toHaveBeenCalledTimes(2);
		expect(startMock).toHaveBeenCalledWith("org-1", spawnConfig);
		expect(startMock).toHaveBeenCalledWith("org-2", spawnConfig);
		expect([...internals.instances.keys()].sort()).toEqual(["org-1", "org-2"]);
	});

	test("ignores organization IDs that are unsafe as path segments", async () => {
		const startMock = mock(async () => ({
			port: 60_000,
			secret: "secret",
			machineId: "host-1",
		}));
		coordinator.start = startMock;

		await coordinator.reconcile(
			["org-1", "../outside", "org/child", "org\\child", ".", ".."],
			spawnConfig,
		);

		expect(startMock).toHaveBeenCalledTimes(1);
		expect(startMock).toHaveBeenCalledWith("org-1", spawnConfig);
	});

	test("stops a running service removed from the authenticated set", async () => {
		internals.instances.set("stale-org", {
			pid: 2001,
			port: 60_001,
			secret: "secret",
			status: "running",
			owned: true,
		});
		coordinator.start = mock(async () => ({
			port: 60_000,
			secret: "secret",
			machineId: "host-1",
		}));

		await coordinator.reconcile([], spawnConfig);

		expect(internals.instances.has("stale-org")).toBe(false);
		expect(killedPids).toContainEqual({ pid: 2001, signal: "SIGTERM" });
	});

	test("an older in-flight reconciliation cannot restore a removed org", async () => {
		let releaseOldStart: () => void = () => {};
		const startMock = mock(async (organizationId: string) => {
			if (organizationId === "old-org") {
				await new Promise<void>((resolve) => {
					releaseOldStart = resolve;
				});
			}
			internals.instances.set(organizationId, {
				pid: organizationId === "old-org" ? 3001 : 3002,
				port: 60_000,
				secret: "secret",
				status: "running",
				owned: true,
			});
			return { port: 60_000, secret: "secret", machineId: "host-1" };
		});
		coordinator.start = startMock;

		const oldReconciliation = coordinator.reconcile(["old-org"], spawnConfig);
		await Promise.resolve();
		await coordinator.reconcile(["new-org"], spawnConfig);
		releaseOldStart();
		await oldReconciliation;

		expect([...internals.instances.keys()]).toEqual(["new-org"]);
		expect(killedPids).toContainEqual({ pid: 3001, signal: "SIGTERM" });
	});

	test("stopAll tears down a service that finishes starting late", async () => {
		let releaseStart: () => void = () => {};
		const startOrAdoptMock = mock(async (organizationId: string) => {
			await new Promise<void>((resolve) => {
				releaseStart = resolve;
			});
			internals.instances.set(organizationId, {
				pid: 4001,
				port: 60_000,
				secret: "secret",
				status: "running",
				owned: true,
			});
			return { port: 60_000, secret: "secret", machineId: "host-1" };
		});
		(
			coordinator as unknown as { startOrAdopt: typeof startOrAdoptMock }
		).startOrAdopt = startOrAdoptMock;

		const pendingStart = coordinator.start("org-1", spawnConfig);
		await Promise.resolve();
		coordinator.stopAll();
		releaseStart();

		await expect(pendingStart).rejects.toThrow("start cancelled");
		expect(internals.instances.size).toBe(0);
		expect(killedPids).toContainEqual({ pid: 4001, signal: "SIGTERM" });
	});

	test("cancels startup recovery when membership is removed", async () => {
		coordinator.start = mock(async () => {
			throw new Error("start failed");
		});

		await coordinator.reconcile(["org-1"], spawnConfig);
		expect(internals.respawns.has("org-1")).toBe(true);

		await coordinator.reconcile([], spawnConfig);
		expect(internals.respawns.has("org-1")).toBe(false);
	});

	test("does not schedule recovery for a superseded start failure", async () => {
		let rejectOldStart: (error: Error) => void = () => {};
		let startCount = 0;
		coordinator.start = mock(async () => {
			startCount++;
			if (startCount === 1) {
				await new Promise<void>((_resolve, reject) => {
					rejectOldStart = reject;
				});
			}
			return { port: 60_000, secret: "secret", machineId: "host-1" };
		});

		const oldReconciliation = coordinator.reconcile(["org-1"], spawnConfig);
		await Promise.resolve();
		await coordinator.reconcile(["org-1"], spawnConfig);
		rejectOldStart(new Error("superseded start"));
		await oldReconciliation;

		expect(internals.respawns.has("org-1")).toBe(false);
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

	test("restart rejects an unsafe organization ID before dispatch", async () => {
		await expect(
			coordinator.restart("../outside", spawnConfig),
		).rejects.toThrow("Invalid organization ID");
		expect(spawnMock).not.toHaveBeenCalled();
	});

	test("reset rejects an unsafe organization ID before reading manifests", async () => {
		await expect(coordinator.reset("../outside", spawnConfig)).rejects.toThrow(
			"Invalid organization ID",
		);
		expect(readManifestMock).not.toHaveBeenCalled();
		expect(spawnMock).not.toHaveBeenCalled();
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

	/** A live process that looks like the host-service that wrote the manifest. */
	function stubHolderIdentity(
		identity: { elapsedMs: number; command: string } | null = {
			elapsedMs: 30_000,
			command:
				"/Applications/Superset.app/Contents/MacOS/Superset /app/host-service.js",
		},
	): void {
		(
			coordinator as unknown as {
				inspectProcess: (pid: number) => Promise<typeof identity>;
			}
		).inspectProcess = async () => identity;
	}

	test("reaps an alive-but-unhealthy manifest holder started this boot before spawning", async () => {
		manifestStore.current = {
			...baseManifest(4321, "http://127.0.0.1:55555"),
			startedAt: Date.now() - 20_000,
		};
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));
		// Alive until SIGKILLed, so the post-kill wait returns promptly.
		isProcessAliveMock.mockImplementation(() => killedPids.length === 0);
		stubHolderIdentity();

		const conn = await coordinator.start("org-1", spawnConfig);

		expect(killedPids).toEqual([{ pid: 4321, signal: "SIGKILL" }]);
		expect(removeManifestMock).toHaveBeenCalled();
		expect(manifestStore.current).toBeNull();
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});

	test("reap leaves a manifest another instance claimed after the kill", async () => {
		manifestStore.current = {
			...baseManifest(4321, "http://127.0.0.1:55555"),
			startedAt: Date.now() - 20_000,
		};
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));
		isProcessAliveMock.mockImplementation(() => killedPids.length === 0);
		stubHolderIdentity();
		killProcessMock.mockImplementationOnce((pid, signal) => {
			killedPids.push({ pid, signal });
			// A peer claims the manifest between our kill and our removal.
			manifestStore.current = baseManifest(9999, "http://127.0.0.1:55556");
		});

		await coordinator.start("org-1", spawnConfig);

		expect(removeManifestMock).not.toHaveBeenCalled();
		expect(manifestStore.current?.pid).toBe(9999);
	});

	test("does not reap when the live pid is not a host-service (same-boot pid recycling)", async () => {
		manifestStore.current = {
			...baseManifest(4321, "http://127.0.0.1:55555"),
			startedAt: Date.now() - 20_000,
		};
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));
		isProcessAliveMock.mockImplementation(() => true);
		stubHolderIdentity({ elapsedMs: 5_000, command: "/usr/bin/vim notes.md" });

		await coordinator.start("org-1", spawnConfig);

		expect(killedPids).toHaveLength(0);
		expect(removeManifestMock).not.toHaveBeenCalled();
		expect(spawnMock).toHaveBeenCalledTimes(1);
	});

	test("does not reap a host-service that started after the manifest was written (recycled onto another host-service)", async () => {
		manifestStore.current = {
			...baseManifest(4321, "http://127.0.0.1:55555"),
			startedAt: Date.now() - 30 * 60_000,
		};
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));
		isProcessAliveMock.mockImplementation(() => true);
		// Started 10 s ago; the manifest is 30 min old.
		stubHolderIdentity({
			elapsedMs: 10_000,
			command:
				"/Applications/Superset.app/Contents/MacOS/Superset /app/host-service.js",
		});

		await coordinator.start("org-1", spawnConfig);

		expect(killedPids).toHaveLength(0);
	});

	test("does not reap when the pid cannot be inspected", async () => {
		manifestStore.current = {
			...baseManifest(4321, "http://127.0.0.1:55555"),
			startedAt: Date.now() - 20_000,
		};
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));
		isProcessAliveMock.mockImplementation(() => true);
		stubHolderIdentity(null);

		await coordinator.start("org-1", spawnConfig);

		expect(killedPids).toHaveLength(0);
	});

	test("does not reap a manifest whose endpoint was never probed (unparsable)", async () => {
		manifestStore.current = {
			...baseManifest(4321, "not a url"),
			startedAt: Date.now() - 20_000,
		};
		isProcessAliveMock.mockImplementation(() => true);
		stubHolderIdentity();

		await coordinator.start("org-1", spawnConfig);

		expect(pollHealthCheckMock).not.toHaveBeenCalled();
		expect(killedPids).toHaveLength(0);
		expect(spawnMock).toHaveBeenCalledTimes(1);
	});

	test("does not reap a manifest holder whose pid is dead", async () => {
		manifestStore.current = {
			...baseManifest(4321, "http://127.0.0.1:55555"),
			startedAt: Date.now(),
		};
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));
		isProcessAliveMock.mockImplementation(() => false);

		await coordinator.start("org-1", spawnConfig);

		expect(killedPids).toHaveLength(0);
		expect(spawnMock).toHaveBeenCalledTimes(1);
	});

	test("does not reap a manifest holder whose startedAt predates this boot (recycled pid)", async () => {
		// baseManifest's startedAt is 0: older than any boot.
		manifestStore.current = baseManifest(4321, "http://127.0.0.1:55555");
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));
		isProcessAliveMock.mockImplementation(() => true);

		await coordinator.start("org-1", spawnConfig);

		expect(killedPids).toHaveLength(0);
		expect(removeManifestMock).not.toHaveBeenCalled();
		expect(spawnMock).toHaveBeenCalledTimes(1);
	});

	test("does not reap a healthy manifest holder (adopts it instead)", async () => {
		manifestStore.current = {
			...baseManifest(4321, "http://127.0.0.1:55555"),
			startedAt: Date.now(),
		};
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(true));

		const conn = await coordinator.start("org-1", spawnConfig);

		expect(killedPids).toHaveLength(0);
		expect(spawnMock).not.toHaveBeenCalled();
		expect(conn.port).toBe(55555);
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
		manifestStore.current = baseManifest(4321);

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
			spawnedAt: Date.now(),
			outputTail: "",
			redactions: ["secret"],
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
		expect(showAlertMock).not.toHaveBeenCalled();
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
		expect(showAlertMock).not.toHaveBeenCalled();
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

		expect(showAlertMock).toHaveBeenCalledTimes(1);
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
		expect(showAlertMock).not.toHaveBeenCalled();
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
		if (!scheduled) throw new Error("no respawn was scheduled");
		scheduled.run(); // fires, then parks on the config promise
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
		// Assert rather than optional-chain: `stability?.run()` would let this pass
		// without ever exercising the reset path.
		if (!stability) throw new Error("no stability timer was scheduled");
		internals.instances.set("org-1", {
			pid: 9299,
			port: 55555,
			secret: "secret",
			status: "running",
			owned: false, // a foreign, adopted instance replaced ours
		});
		stability.run();

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
		if (!scheduled) throw new Error("no respawn was scheduled");
		scheduled.run();
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

describe("HostServiceCoordinator.stop manifest ownership", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;
	let internals: { instances: Map<string, unknown> };

	function trackOwned(
		pid: number,
		status: "running" | "starting" = "running",
	): void {
		internals.instances.set("org-1", {
			pid,
			port: 55555,
			secret: "secret",
			status,
			spawnedAt: Date.now(),
			outputTail: "",
			redactions: ["secret"],
			owned: true,
		});
	}

	beforeEach(() => {
		resetMocks();
		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));
		coordinator = new HostServiceCoordinator();
		internals = coordinator as unknown as typeof internals;
		coordinator.setConfigProvider(async () => spawnConfig);
	});

	afterEach(() => {
		coordinator.stopAll();
		if (testManifestRoot) {
			fs.rmSync(testManifestRoot, { recursive: true, force: true });
			testManifestRoot = "";
		}
	});

	test("removes the manifest our own child wrote", () => {
		trackOwned(4242);
		manifestStore.current = baseManifest(4242);

		coordinator.stop("org-1");

		expect(removeManifestMock).toHaveBeenCalled();
		expect(manifestStore.current).toBeNull();
	});

	test("leaves a manifest claimed by another live instance, but still kills our child", () => {
		trackOwned(4242);
		manifestStore.current = baseManifest(9999);

		coordinator.stop("org-1");

		expect(removeManifestMock).not.toHaveBeenCalled();
		expect(manifestStore.current?.pid).toBe(9999);
		expect(killedPids).toEqual([{ pid: 4242, signal: "SIGTERM" }]);
	});

	test("leaves an unreadable manifest alone (a torn read of a concurrent claim must not be deleted)", () => {
		trackOwned(4242);
		manifestStore.current = null;

		coordinator.stop("org-1");

		expect(removeManifestMock).not.toHaveBeenCalled();
	});

	test("handleChildExit removes only a manifest the dead child held", () => {
		const internalsWithExit = coordinator as unknown as {
			instances: Map<string, unknown>;
			handleChildExit(
				organizationId: string,
				childPid: number,
				code: number | null,
				signal: NodeJS.Signals | null,
			): void;
		};
		trackOwned(4242, "starting");
		manifestStore.current = baseManifest(9999);

		internalsWithExit.handleChildExit("org-1", 4242, null, "SIGKILL");

		expect(removeManifestMock).not.toHaveBeenCalled();
		expect(manifestStore.current?.pid).toBe(9999);
	});

	test("handleChildExit removes the dead child's own manifest", () => {
		const internalsWithExit = coordinator as unknown as {
			instances: Map<string, unknown>;
			handleChildExit(
				organizationId: string,
				childPid: number,
				code: number | null,
				signal: NodeJS.Signals | null,
			): void;
		};
		trackOwned(4242, "starting");
		manifestStore.current = baseManifest(4242);

		internalsWithExit.handleChildExit("org-1", 4242, null, "SIGKILL");

		expect(removeManifestMock).toHaveBeenCalled();
		expect(manifestStore.current).toBeNull();
	});
});

describe("HostServiceCoordinator.stop SIGKILL escalation", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;
	let internals: {
		instances: Map<string, unknown>;
		handleChildExit(
			organizationId: string,
			childPid: number,
			code: number | null,
			signal: NodeJS.Signals | null,
		): void;
	};
	let pendingTimers: Array<{ run: () => void; delayMs: number }>;

	function trackOwned(pid: number): void {
		internals.instances.set("org-1", {
			pid,
			port: 55555,
			secret: "secret",
			status: "running",
			spawnedAt: Date.now(),
			outputTail: "",
			redactions: ["secret"],
			owned: true,
		});
	}

	beforeEach(() => {
		resetMocks();
		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));
		coordinator = new HostServiceCoordinator();
		internals = coordinator as unknown as typeof internals;
		pendingTimers = [];
		(
			coordinator as unknown as {
				scheduleRespawnTimer: (
					run: () => void,
					delayMs: number,
				) => ReturnType<typeof setTimeout>;
			}
		).scheduleRespawnTimer = (run, delayMs) => {
			pendingTimers.push({ run, delayMs });
			return { unref() {} } as unknown as ReturnType<typeof setTimeout>;
		};
	});

	afterEach(() => {
		coordinator.stopAll();
		if (testManifestRoot) {
			fs.rmSync(testManifestRoot, { recursive: true, force: true });
			testManifestRoot = "";
		}
	});

	test("escalates to SIGKILL when the child is still alive after the grace", () => {
		trackOwned(4242);

		coordinator.stop("org-1");

		expect(killedPids).toEqual([{ pid: 4242, signal: "SIGTERM" }]);
		expect(pendingTimers).toHaveLength(1);
		expect(pendingTimers[0]?.delayMs).toBeGreaterThan(0);

		pendingTimers[0]?.run();

		expect(killedPids).toEqual([
			{ pid: 4242, signal: "SIGTERM" },
			{ pid: 4242, signal: "SIGKILL" },
		]);
	});

	test("does not SIGKILL when the child exited before the grace elapsed", () => {
		trackOwned(4242);

		coordinator.stop("org-1");
		internals.handleChildExit("org-1", 4242, 0, null);
		pendingTimers[0]?.run();

		expect(killedPids).toEqual([{ pid: 4242, signal: "SIGTERM" }]);
	});

	test("does not SIGKILL a pid that is already gone when the grace elapses", () => {
		trackOwned(4242);

		coordinator.stop("org-1");
		isProcessAliveMock.mockImplementation(() => false);
		pendingTimers[0]?.run();

		expect(killedPids).toEqual([{ pid: 4242, signal: "SIGTERM" }]);
	});

	test("never schedules an escalation for an adopted (foreign) child", () => {
		internals.instances.set("org-1", {
			pid: 4321,
			port: 55555,
			secret: "manifest-secret",
			status: "running",
			owned: false,
		});

		coordinator.stop("org-1");

		expect(killedPids).toHaveLength(0);
		expect(pendingTimers).toHaveLength(0);
	});
});

describe("parseEtime", () => {
	test("parses ps's [[dd-]hh:]mm:ss elapsed column", async () => {
		const { parseEtime } = await import("./host-service-coordinator");
		expect(parseEtime("00:05")).toBe(5_000);
		expect(parseEtime("01:02:03")).toBe((3600 + 120 + 3) * 1000);
		expect(parseEtime("2-01:02:03")).toBe((2 * 86400 + 3600 + 120 + 3) * 1000);
		expect(parseEtime("garbage")).toBeNull();
		expect(parseEtime("")).toBeNull();
	});
});

afterAll(() => {
	mock.restore();
});
