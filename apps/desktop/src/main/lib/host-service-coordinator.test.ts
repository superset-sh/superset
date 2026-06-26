import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { EventEmitter } from "node:events";
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

const { HostServiceCoordinator, pipeWithPrefix } = await import(
	"./host-service-coordinator"
);

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
	killProcessMock.mockClear();
	pollHealthCheckMock.mockClear();
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

class FakeSource extends EventEmitter {
	emitChunk(buf: Buffer): void {
		this.emit("data", buf);
	}
	emitEnd(): void {
		this.emit("end");
	}
}

class FakeTarget {
	chunks: string[] = [];
	write(chunk: string | Buffer): boolean {
		this.chunks.push(
			typeof chunk === "string" ? chunk : chunk.toString("utf8"),
		);
		return true;
	}
	combined(): string {
		return this.chunks.join("");
	}
}

const REPLACEMENT = "�";

describe("pipeWithPrefix", () => {
	test("preserves multi-byte UTF-8 codepoints split across chunk boundaries", () => {
		const source = new FakeSource();
		const target = new FakeTarget();
		pipeWithPrefix(source, target as unknown as NodeJS.WritableStream, "[tag]");

		// U+1F527 ("🔧") = F0 9F 94 A7. Split the 4-byte sequence mid-codepoint:
		// before the fix, each half decoded to U+FFFD, producing garbled output.
		const emoji = Buffer.from("🔧", "utf8");
		expect(emoji.length).toBe(4);

		source.emitChunk(
			Buffer.concat([Buffer.from("hello ", "utf8"), emoji.subarray(0, 2)]),
		);
		source.emitChunk(
			Buffer.concat([emoji.subarray(2), Buffer.from(" world\n", "utf8")]),
		);

		const out = target.combined();
		expect(out).toBe("[tag] hello 🔧 world\n");
		expect(out).not.toContain(REPLACEMENT);
	});

	test("does not garble CJK characters split across chunks", () => {
		const source = new FakeSource();
		const target = new FakeTarget();
		pipeWithPrefix(source, target as unknown as NodeJS.WritableStream, "[tag]");

		// U+4E2D ("中") = E4 B8 AD (3 bytes).
		const han = Buffer.from("中", "utf8");
		expect(han.length).toBe(3);

		source.emitChunk(
			Buffer.concat([Buffer.from("a", "utf8"), han.subarray(0, 1)]),
		);
		source.emitChunk(
			Buffer.concat([han.subarray(1), Buffer.from("b\n", "utf8")]),
		);

		const out = target.combined();
		expect(out).toBe("[tag] a中b\n");
		expect(out).not.toContain(REPLACEMENT);
	});

	test("prefixes each line in a multi-line chunk", () => {
		const source = new FakeSource();
		const target = new FakeTarget();
		pipeWithPrefix(source, target as unknown as NodeJS.WritableStream, "[hs]");

		source.emitChunk(Buffer.from("one\ntwo\nthree\n", "utf8"));

		expect(target.chunks).toEqual(["[hs] one\n", "[hs] two\n", "[hs] three\n"]);
	});

	test("flushes trailing partial line on end", () => {
		const source = new FakeSource();
		const target = new FakeTarget();
		pipeWithPrefix(source, target as unknown as NodeJS.WritableStream, "[hs]");

		source.emitChunk(Buffer.from("no-newline-here", "utf8"));
		source.emitEnd();

		expect(target.combined()).toBe("[hs] no-newline-here\n");
	});
});

afterAll(() => {
	mock.restore();
});
