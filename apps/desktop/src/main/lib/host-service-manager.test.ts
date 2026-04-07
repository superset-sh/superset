import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

class MockChildProcess extends EventEmitter {
	stdout = new EventEmitter();
	stderr = new EventEmitter();
	kill = mock(() => true);
	disconnect = mock(() => {});
	unref = mock(() => {});
}

const getProcessEnvWithShellPathMock = mock(
	async (baseEnv?: NodeJS.ProcessEnv): Promise<Record<string, string>> => ({
		...(baseEnv ? (baseEnv as Record<string, string>) : {}),
		HOME: "/Users/test",
		PATH: "/usr/bin:/bin",
		SHELL: "/bin/zsh",
	}),
);
let lastChild: MockChildProcess | null = null;
const spawnMock = mock((..._args: unknown[]) => {
	lastChild = new MockChildProcess();
	return lastChild as unknown as ChildProcess;
});
let HostServiceManager: typeof import("./host-service-manager").HostServiceManager;
let checkCompatibility: typeof import("./host-service-manager").checkCompatibility;
let HOST_SERVICE_PROTOCOL_VERSION: typeof import("./host-service-manifest").HOST_SERVICE_PROTOCOL_VERSION;

describe("HostServiceManager", () => {
	beforeAll(async () => {
		const childProcessModule = await import("node:child_process");
		const shellEnvModule = await import(
			"../../lib/trpc/routers/workspaces/utils/shell-env"
		);

		spyOn(childProcessModule, "spawn").mockImplementation(((..._args) =>
			spawnMock(..._args)) as typeof childProcessModule.spawn);
		spyOn(shellEnvModule, "getProcessEnvWithShellPath").mockImplementation(
			(baseEnv) => getProcessEnvWithShellPathMock(baseEnv),
		);

		mock.module("electron", () => ({
			app: {
				isPackaged: false,
				getAppPath: () => "/tmp/app",
				getVersion: () => "1.0.0-test",
			},
		}));

		({ HostServiceManager, checkCompatibility } = await import(
			"./host-service-manager"
		));
		({ HOST_SERVICE_PROTOCOL_VERSION } = await import(
			"./host-service-manifest"
		));
	});

	afterAll(() => {
		mock.restore();
	});

	beforeEach(() => {
		getProcessEnvWithShellPathMock.mockReset();
		getProcessEnvWithShellPathMock.mockImplementation(
			async (baseEnv?: NodeJS.ProcessEnv) => ({
				...(baseEnv ? (baseEnv as Record<string, string>) : {}),
				HOME: "/Users/test",
				PATH: "/usr/bin:/bin",
				SHELL: "/bin/zsh",
			}),
		);
		spawnMock.mockReset();
		spawnMock.mockImplementation(() => {
			lastChild = new MockChildProcess();
			return lastChild as unknown as ChildProcess;
		});
		lastChild = null;
	});

	it("dedupes concurrent starts while shell env is resolving", async () => {
		const manager = new HostServiceManager();
		const pendingEnv = createDeferred<Record<string, string>>();
		getProcessEnvWithShellPathMock.mockImplementation(() => pendingEnv.promise);

		const firstStart = manager.start("org-1");
		const secondStart = manager.start("org-1");

		expect(manager.getStatus("org-1")).toBe("starting");

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(getProcessEnvWithShellPathMock.mock.calls).toHaveLength(1);

		pendingEnv.resolve({
			HOME: "/Users/test",
			PATH: "/usr/bin:/bin",
			SHELL: "/bin/zsh",
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(spawnMock.mock.calls).toHaveLength(1);
		expect(lastChild).not.toBeNull();
		expect(spawnMock.mock.calls[0]?.[2]).toMatchObject({
			stdio: ["ignore", "pipe", "pipe", "ipc"],
		});

		lastChild?.emit("message", { type: "ready", port: 4242 });

		expect(await firstStart).toBe(4242);
		expect(await secondStart).toBe(4242);
		expect(manager.getPort("org-1")).toBe(4242);
	});

	it("spawns host-service from shell-path env plus explicit service keys", async () => {
		const manager = new HostServiceManager();
		manager.setAuthToken("auth-token");
		manager.setCloudApiUrl("https://api.example.com");

		const originalValues = {
			__HOST_SERVICE_RUNTIME_ENV_TEST__:
				process.env.__HOST_SERVICE_RUNTIME_ENV_TEST__,
		};
		process.env.__HOST_SERVICE_RUNTIME_ENV_TEST__ = "desktop-runtime";

		try {
			const startPromise = manager.start("org-1");
			await new Promise((resolve) => setTimeout(resolve, 0));

			const spawnOptions = spawnMock.mock.calls[0]?.[2] as
				| { env?: Record<string, string> }
				| undefined;
			const env = spawnOptions?.env;

			expect(env).toBeDefined();
			expect(env).toMatchObject({
				HOME: "/Users/test",
				PATH: "/usr/bin:/bin",
				SHELL: "/bin/zsh",
				__HOST_SERVICE_RUNTIME_ENV_TEST__: "desktop-runtime",
				AUTH_TOKEN: "auth-token",
				CLOUD_API_URL: "https://api.example.com",
				ELECTRON_RUN_AS_NODE: "1",
				SUPERSET_AGENT_HOOK_VERSION: expect.any(String),
				SUPERSET_HOME_DIR: expect.any(String),
			});
			expect(env?.HOST_SERVICE_SECRET).toEqual(expect.any(String));
			expect(env?.HOST_DB_PATH).toEqual(expect.any(String));

			lastChild?.emit("message", { type: "ready", port: 4001 });
			await startPromise;
		} finally {
			if (originalValues.__HOST_SERVICE_RUNTIME_ENV_TEST__ !== undefined) {
				process.env.__HOST_SERVICE_RUNTIME_ENV_TEST__ =
					originalValues.__HOST_SERVICE_RUNTIME_ENV_TEST__;
			} else {
				delete process.env.__HOST_SERVICE_RUNTIME_ENV_TEST__;
			}
		}
	});

	it("stopAll() kills all instances", async () => {
		const manager = new HostServiceManager();

		const p1 = manager.start("org-1");
		await new Promise((resolve) => setTimeout(resolve, 0));
		const child1 = lastChild;
		child1?.emit("message", { type: "ready", port: 4001 });
		await p1;

		const p2 = manager.start("org-2");
		await new Promise((resolve) => setTimeout(resolve, 0));
		const child2 = lastChild;
		child2?.emit("message", { type: "ready", port: 4002 });
		await p2;

		manager.stopAll();

		expect(child1?.kill).toHaveBeenCalledWith("SIGTERM");
		expect(child2?.kill).toHaveBeenCalledWith("SIGTERM");
		expect(manager.getStatus("org-1")).toBe("stopped");
		expect(manager.getStatus("org-2")).toBe("stopped");
	});

	it("releaseAll() detaches without killing", async () => {
		const manager = new HostServiceManager();

		const p1 = manager.start("org-1");
		await new Promise((resolve) => setTimeout(resolve, 0));
		lastChild?.emit("message", { type: "ready", port: 4001 });
		await p1;

		const child = lastChild;

		manager.releaseAll();

		expect(child?.kill).not.toHaveBeenCalled();
		expect(manager.getStatus("org-1")).toBe("stopped");
	});

	describe("checkCompatibility", () => {
		it("returns null when protocol version is unknown", () => {
			const result = checkCompatibility({
				protocolVersion: null,
				serviceVersion: null,
			});
			expect(result).toBeNull();
		});

		it("detects protocol mismatch", () => {
			const result = checkCompatibility({
				protocolVersion: 999,
				serviceVersion: "1.0.0",
			});
			expect(result).toEqual({
				compatible: false,
				reason: expect.stringContaining("Protocol mismatch"),
			});
		});

		it("detects compatible with update available", () => {
			const result = checkCompatibility({
				protocolVersion: HOST_SERVICE_PROTOCOL_VERSION,
				serviceVersion: "0.0.1-old",
			});
			expect(result).toEqual({ compatible: true, updateAvailable: true });
		});

		it("detects compatible with same version", () => {
			const result = checkCompatibility({
				protocolVersion: HOST_SERVICE_PROTOCOL_VERSION,
				serviceVersion: "1.0.0-test",
			});
			expect(result).toEqual({ compatible: true, updateAvailable: false });
		});
	});
});
