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

let testRoot = "";
const isProcessAliveMock = mock((_pid: number) => true);

const realManifest = await import("./host-service-manifest");
mock.module("./host-service-manifest", () => ({
	...realManifest,
	isProcessAlive: isProcessAliveMock,
	manifestDir: (orgId: string) => path.join(testRoot, orgId),
}));

mock.module("@superset/shared/host-info", () => ({
	getHostId: () => "host-1",
	getHostName: () => "host",
}));

const { acquireSpawnLock, readSpawnLock } = await import("./host-service-lock");

const ORG = "org-1";
const lockFile = () => path.join(testRoot, ORG, "spawn.lock");

describe("acquireSpawnLock", () => {
	beforeEach(() => {
		testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsl-test-"));
		isProcessAliveMock.mockClear();
		isProcessAliveMock.mockImplementation(() => true);
	});

	afterEach(() => {
		if (testRoot) {
			fs.rmSync(testRoot, { recursive: true, force: true });
			testRoot = "";
		}
	});

	test("creates the lock file and records the owning pid", () => {
		const handle = acquireSpawnLock(ORG, { staleMs: 30_000 });
		expect(handle).not.toBeNull();

		const lock = readSpawnLock(ORG);
		expect(lock?.ownerPid).toBe(process.pid);
		expect(lock?.machineId).toBe("host-1");
		expect(fs.existsSync(lockFile())).toBe(true);
	});

	test("second acquire returns null while a live holder keeps the lock", () => {
		const first = acquireSpawnLock(ORG, { staleMs: 30_000 });
		expect(first).not.toBeNull();

		const second = acquireSpawnLock(ORG, { staleMs: 30_000 });
		expect(second).toBeNull();
	});

	test("release removes the file and lets the next caller acquire", () => {
		const first = acquireSpawnLock(ORG, { staleMs: 30_000 });
		first?.release();
		expect(fs.existsSync(lockFile())).toBe(false);

		const second = acquireSpawnLock(ORG, { staleMs: 30_000 });
		expect(second).not.toBeNull();
	});

	test("steals the lock when the holder's pid is dead", () => {
		fs.mkdirSync(path.join(testRoot, ORG), { recursive: true });
		fs.writeFileSync(
			lockFile(),
			JSON.stringify({
				ownerPid: 424242,
				machineId: "host-1",
				acquiredAt: Date.now(),
			}),
		);
		isProcessAliveMock.mockImplementation(() => false);

		const handle = acquireSpawnLock(ORG, { staleMs: 30_000 });

		expect(handle).not.toBeNull();
		expect(readSpawnLock(ORG)?.ownerPid).toBe(process.pid);
	});

	test("steals the lock when it is older than staleMs even if the pid is alive", () => {
		fs.mkdirSync(path.join(testRoot, ORG), { recursive: true });
		fs.writeFileSync(
			lockFile(),
			JSON.stringify({
				ownerPid: 424242,
				machineId: "host-1",
				acquiredAt: Date.now() - 60_000,
			}),
		);
		isProcessAliveMock.mockImplementation(() => true);

		const handle = acquireSpawnLock(ORG, { staleMs: 30_000 });

		expect(handle).not.toBeNull();
		expect(readSpawnLock(ORG)?.ownerPid).toBe(process.pid);
	});

	test("steals a garbage/partial lock file", () => {
		fs.mkdirSync(path.join(testRoot, ORG), { recursive: true });
		fs.writeFileSync(lockFile(), "{ not valid json");

		const handle = acquireSpawnLock(ORG, { staleMs: 30_000 });

		expect(handle).not.toBeNull();
		expect(readSpawnLock(ORG)?.ownerPid).toBe(process.pid);
	});
});

afterAll(() => {
	mock.restore();
});
