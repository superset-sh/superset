import { beforeEach, describe, expect, it, mock } from "bun:test";
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
}

const getProcessEnvWithShellPathMock = mock(
	async (env: Record<string, string>) => env,
);
let lastChild: MockChildProcess | null = null;
const spawnMock = mock(() => {
	lastChild = new MockChildProcess();
	return lastChild as unknown as ChildProcess;
});

mock.module("electron", () => ({
	app: {
		isPackaged: false,
		getAppPath: () => "/tmp/app",
	},
}));

mock.module("../../lib/trpc/routers/workspaces/utils/shell-env", () => ({
	getProcessEnvWithShellPath: getProcessEnvWithShellPathMock,
}));

mock.module("node:child_process", () => ({
	spawn: spawnMock,
}));

const { HostServiceManager } = await import("./host-service-manager");

describe("HostServiceManager", () => {
	beforeEach(() => {
		getProcessEnvWithShellPathMock.mockReset();
		getProcessEnvWithShellPathMock.mockImplementation(
			async (env: Record<string, string>) => env,
		);
		spawnMock.mockReset();
		spawnMock.mockImplementation(() => {
			lastChild = new MockChildProcess();
			return lastChild as unknown as ChildProcess;
		});
		lastChild = null;
	});

	it("dedupes concurrent starts while shell PATH is resolving", async () => {
		const manager = new HostServiceManager();
		const pendingEnv = createDeferred<Record<string, string>>();
		getProcessEnvWithShellPathMock.mockImplementation(() => pendingEnv.promise);

		const firstStart = manager.start("org-1");
		const secondStart = manager.start("org-1");

		expect(manager.getStatus("org-1")).toBe("starting");
		expect(getProcessEnvWithShellPathMock.mock.calls).toHaveLength(1);

		pendingEnv.resolve({ PATH: "/usr/bin:/bin" });
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(spawnMock.mock.calls).toHaveLength(1);
		expect(lastChild).not.toBeNull();

		lastChild?.stdout.emit("data", Buffer.from('{"port":4242}\n'));

		expect(await firstStart).toBe(4242);
		expect(await secondStart).toBe(4242);
		expect(manager.getPort("org-1")).toBe(4242);
	});
});
