import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";

const APP_VERSION = "1.2.3";

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

mock.module("./host-service-manifest", () => ({
	readManifest: readManifestMock,
	removeManifest: removeManifestMock,
	isProcessAlive: isProcessAliveMock,
	listManifests: mock(() => []),
	manifestDir: (orgId: string) => path.join(testManifestRoot, orgId),
}));

const pollHealthCheckMock = mock(() => Promise.resolve(true));

mock.module("./host-service-utils", () => ({
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

mock.module("@superset/local-db", () => ({ settings: {} }));
mock.module("@superset/shared/host-info", () => ({
	getHostId: () => "host-1",
	getHostName: () => "host",
}));
mock.module("main/env.main", () => ({
	env: { NEXT_PUBLIC_API_URL: "", RELAY_URL: "" },
}));
mock.module("shared/env.shared", () => ({
	env: { DESKTOP_VITE_PORT: 3000, DESKTOP_NOTIFICATIONS_PORT: 4000 },
}));
mock.module("./app-environment", () => ({
	SUPERSET_HOME_DIR: "/tmp/superset",
}));
mock.module("./local-db", () => ({
	localDb: {
		select: () => ({ from: () => ({ get: () => null }) }),
	},
}));
mock.module("./terminal/env", () => ({ HOOK_PROTOCOL_VERSION: "1" }));
mock.module("../../lib/trpc/routers/workspaces/utils/shell-env", () => ({
	getProcessEnvWithShellPath: async (e: Record<string, string>) => e,
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

describe("HostServiceCoordinator.tryAdopt — adoption health check", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;
	let killedPids: Array<{ pid: number; signal: NodeJS.Signals | number }>;
	let originalKill: typeof process.kill;
	let spawnMock: ReturnType<typeof mock>;

	beforeEach(() => {
		manifestStore.current = null;
		readManifestMock.mockClear();
		removeManifestMock.mockClear();
		isProcessAliveMock.mockClear();
		pollHealthCheckMock.mockClear();

		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));

		killedPids = [];
		originalKill = process.kill;
		// `process.kill` is read-only in some Bun versions — assign via cast.
		(process as unknown as { kill: typeof process.kill }).kill = ((
			pid: number,
			signal?: NodeJS.Signals | number,
		) => {
			killedPids.push({ pid, signal: signal ?? "SIGTERM" });
			return true;
		}) as typeof process.kill;

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
		// Unconditional — if an assertion throws mid-test, the override must
		// still be torn down or the next test captures the wrong `originalKill`.
		(process as unknown as { kill: typeof process.kill }).kill = originalKill;
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
		(process as unknown as { kill: typeof process.kill }).kill = (() => {
			const err: NodeJS.ErrnoException = new Error("kill ESRCH");
			err.code = "ESRCH";
			throw err;
		}) as typeof process.kill;

		const conn = await coordinator.start("org-1", spawnConfig);

		expect(removeManifestMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});

	test("kills with SIGTERM (existing behavior) on app-version mismatch, before health check", async () => {
		manifestStore.current = {
			...baseManifest(5555),
			spawnedByAppVersion: "0.9.0",
		};

		const conn = await coordinator.start("org-1", spawnConfig);

		// App-version gate runs before the new health check.
		expect(pollHealthCheckMock).not.toHaveBeenCalled();
		expect(killedPids).toContainEqual({ pid: 5555, signal: "SIGTERM" });
		expect(removeManifestMock).toHaveBeenCalledTimes(1);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});
});

describe("HostServiceCoordinator.reset", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;
	let killedPids: Array<{ pid: number; signal: NodeJS.Signals | number }>;
	let originalKill: typeof process.kill;
	let spawnMock: ReturnType<typeof mock>;

	beforeEach(() => {
		manifestStore.current = null;
		readManifestMock.mockClear();
		removeManifestMock.mockClear();
		isProcessAliveMock.mockClear();
		pollHealthCheckMock.mockClear();

		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));

		killedPids = [];
		originalKill = process.kill;
		(process as unknown as { kill: typeof process.kill }).kill = ((
			pid: number,
			signal?: NodeJS.Signals | number,
		) => {
			killedPids.push({ pid, signal: signal ?? "SIGTERM" });
			return true;
		}) as typeof process.kill;

		coordinator = new HostServiceCoordinator();
		spawnMock = mock(async () => ({
			port: 60000,
			secret: "fresh-secret",
			machineId: "host-1",
		}));
		(coordinator as unknown as { spawn: typeof spawnMock }).spawn = spawnMock;
	});

	afterEach(() => {
		(process as unknown as { kill: typeof process.kill }).kill = originalKill;
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
