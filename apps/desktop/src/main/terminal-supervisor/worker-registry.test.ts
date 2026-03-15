import { beforeEach, describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";

const listedGenerations: string[] = [];
const fakeClients = new Map<string, FakeTerminalDaemonClient>();
const ensureConnectedBehaviors = new Map<string, () => Promise<void>>();
const tryConnectBehaviors = new Map<string, () => Promise<boolean>>();
const listSessionsBehaviors = new Map<
	string,
	() => Promise<{ sessions: Array<Record<string, unknown>> }>
>();

mock.module("main/lib/terminal-host/runtime-paths", () => ({
	getTerminalWorkerRuntimePaths: (generation: string) => ({
		socketPath: `/tmp/terminal-worker.${generation}.sock`,
		tokenPath: `/tmp/terminal-worker.${generation}.token`,
		pidPath: `/tmp/terminal-worker.${generation}.pid`,
		spawnLockPath: `/tmp/terminal-worker.${generation}.spawn.lock`,
		scriptMtimePath: `/tmp/terminal-worker.${generation}.mtime`,
		logPath: `/tmp/terminal-worker.${generation}.log`,
	}),
	listTerminalWorkerGenerations: () => [...listedGenerations],
	TERMINAL_WORKER_GENERATION_ENV: "SUPERSET_TERMINAL_WORKER_GENERATION",
}));

class FakeTerminalDaemonClient extends EventEmitter {
	readonly ensureConnected = mock(async () => {
		const behavior = ensureConnectedBehaviors.get(this.generation);
		if (behavior) {
			await behavior();
		}
	});
	readonly tryConnectAndAuthenticate = mock(async () => {
		const behavior = tryConnectBehaviors.get(this.generation);
		return behavior ? behavior() : true;
	});
	readonly listSessions = mock(async () => {
		const behavior = listSessionsBehaviors.get(this.generation);
		return behavior ? behavior() : { sessions: [] };
	});
	readonly shutdownIfRunning = mock(async () => ({ wasRunning: true }));
	readonly dispose = mock(() => {});

	constructor(readonly generation: string) {
		super();
	}
}

mock.module("main/lib/terminal-host/daemon-client", () => ({
	TerminalDaemonClient: class extends FakeTerminalDaemonClient {
		constructor(options: {
			spawnEnv?: Record<string, string | undefined>;
			daemonName: string;
		}) {
			super(
				options.spawnEnv?.SUPERSET_TERMINAL_WORKER_GENERATION ??
					options.daemonName.replace("terminal-worker:", ""),
			);
			fakeClients.set(this.generation, this);
		}
	},
}));

const { SupervisorWorkerRegistry } = await import("./worker-registry");

describe("SupervisorWorkerRegistry", () => {
	beforeEach(() => {
		listedGenerations.splice(0, listedGenerations.length);
		fakeClients.clear();
		ensureConnectedBehaviors.clear();
		tryConnectBehaviors.clear();
		listSessionsBehaviors.clear();
	});

	it("keeps the last healthy preferred worker when promoting a new generation fails", async () => {
		const registry = new SupervisorWorkerRegistry({
			log: () => {},
			workerScriptPath: "/tmp/terminal-host.js",
			onData: () => {},
			onExit: () => {},
			onTerminalError: () => {},
			onDisconnected: () => {},
			onError: () => {},
		});

		await registry.ensurePreferredWorkerGeneration("1.0.0");
		const oldWorker = registry.getWorker("1.0.0");
		expect(oldWorker?.state).toBe("preferred");

		ensureConnectedBehaviors.set("2.0.0", async () => {
			throw new Error("spawn failed");
		});

		await registry
			.ensurePreferredWorkerGeneration("2.0.0")
			.catch((error: unknown) => {
				expect(error).toBeInstanceOf(Error);
			});

		expect(registry.getPreferredGeneration()).toBe("1.0.0");
		expect(registry.getWorker("1.0.0")?.state).toBe("preferred");
		expect(registry.getWorker("2.0.0")).toBeNull();
	});

	it("discovers existing workers and returns their live session inventory", async () => {
		listedGenerations.push("1.0.0", "2.0.0");
		listSessionsBehaviors.set("1.0.0", async () => ({
			sessions: [
				{
					sessionId: "pane-old",
					workspaceId: "ws-1",
					paneId: "pane-old",
					isAlive: true,
					attachedClients: 0,
					pid: 123,
				},
			],
		}));
		tryConnectBehaviors.set("2.0.0", async () => false);

		const registry = new SupervisorWorkerRegistry({
			log: () => {},
			workerScriptPath: "/tmp/terminal-host.js",
			onData: () => {},
			onExit: () => {},
			onTerminalError: () => {},
			onDisconnected: () => {},
			onError: () => {},
		});

		const discovered = await registry.discoverExistingWorkers();

		expect(discovered).toHaveLength(1);
		expect(discovered[0]?.generation).toBe("1.0.0");
		expect(discovered[0]?.sessions).toHaveLength(1);
		expect(registry.getWorker("1.0.0")).not.toBeNull();
		expect(registry.getWorker("2.0.0")).toBeNull();
	});
});
