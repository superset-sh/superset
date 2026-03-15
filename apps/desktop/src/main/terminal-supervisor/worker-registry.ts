import { TerminalDaemonClient } from "main/lib/terminal-host/daemon-client";
import {
	getTerminalWorkerRuntimePaths,
	listTerminalWorkerGenerations,
	TERMINAL_WORKER_GENERATION_ENV,
	type TerminalDaemonRuntimePaths,
} from "main/lib/terminal-host/runtime-paths";

export type SupervisorWorkerState = "preferred" | "draining";

export interface ManagedTerminalWorker {
	generation: string;
	state: SupervisorWorkerState;
	client: TerminalDaemonClient;
	runtimePaths: TerminalDaemonRuntimePaths;
}

type WorkerSessionList = Awaited<
	ReturnType<TerminalDaemonClient["listSessions"]>
>["sessions"];

export interface ManagedWorkerSessionSnapshot {
	generation: string;
	state: SupervisorWorkerState;
	sessions: WorkerSessionList;
}

type LogFn = (
	level: "info" | "warn" | "error",
	message: string,
	data?: unknown,
) => void;

export interface SupervisorWorkerRegistryOptions {
	log: LogFn;
	workerScriptPath: string;
	workerSpawnArguments?: string[];
	onData: (generation: string, sessionId: string, data: string) => void;
	onExit: (
		generation: string,
		sessionId: string,
		exitCode: number,
		signal?: number,
	) => void;
	onTerminalError: (
		generation: string,
		sessionId: string,
		error: string,
		code?: string,
	) => void;
	onDisconnected: (generation: string) => void;
	onError: (generation: string, error: Error) => void;
}

export class SupervisorWorkerRegistry {
	private readonly workers = new Map<string, ManagedTerminalWorker>();
	private preferredGeneration: string | null = null;

	constructor(private readonly options: SupervisorWorkerRegistryOptions) {}

	async ensurePreferredWorkerGeneration(
		generation: string,
	): Promise<ManagedTerminalWorker> {
		const existingWorker = this.workers.get(generation) ?? null;
		const worker = existingWorker ?? this.getOrCreateWorker(generation);
		const previousPreferredGeneration = this.preferredGeneration;
		const previousPreferred = previousPreferredGeneration
			? (this.workers.get(previousPreferredGeneration) ?? null)
			: null;
		const previousState = worker.state;

		try {
			await worker.client.ensureConnected();
		} catch (error) {
			worker.state = previousState;
			if (!existingWorker) {
				worker.client.dispose();
				this.workers.delete(generation);
			}
			throw error;
		}

		if (previousPreferred && previousPreferred.generation !== generation) {
			previousPreferred.state = "draining";
		}

		this.preferredGeneration = generation;
		worker.state = "preferred";
		return worker;
	}

	getPreferredGeneration(): string | null {
		return this.preferredGeneration;
	}

	getPreferredWorker(): ManagedTerminalWorker | null {
		if (!this.preferredGeneration) return null;
		return this.workers.get(this.preferredGeneration) ?? null;
	}

	getWorker(generation: string): ManagedTerminalWorker | null {
		return this.workers.get(generation) ?? null;
	}

	listWorkers(): ManagedTerminalWorker[] {
		return [...this.workers.values()];
	}

	getFallbackGeneration(excludingGeneration?: string): string | null {
		if (
			this.preferredGeneration &&
			this.preferredGeneration !== excludingGeneration &&
			this.workers.has(this.preferredGeneration)
		) {
			return this.preferredGeneration;
		}

		const generations = [...this.workers.keys()]
			.filter((generation) => generation !== excludingGeneration)
			.sort((a, b) =>
				a.localeCompare(b, undefined, {
					numeric: true,
					sensitivity: "base",
				}),
			);

		return generations.at(-1) ?? null;
	}

	removeWorker(generation: string): void {
		if (this.preferredGeneration === generation) {
			this.preferredGeneration = null;
		}
		this.workers.delete(generation);
	}

	async withWorker<T>(
		generation: string,
		work: (worker: ManagedTerminalWorker) => Promise<T>,
	): Promise<T> {
		const worker = this.getOrCreateWorker(generation);
		await worker.client.ensureConnected();
		return work(worker);
	}

	async listWorkerSessions(): Promise<ManagedWorkerSessionSnapshot[]> {
		const results: ManagedWorkerSessionSnapshot[] = [];

		for (const worker of this.workers.values()) {
			const listSessions = await worker.client
				.listSessions()
				.catch(() => ({ sessions: [] }));
			results.push({
				generation: worker.generation,
				state: worker.state,
				sessions: listSessions.sessions,
			});
		}

		return results;
	}

	async discoverExistingWorkers(): Promise<ManagedWorkerSessionSnapshot[]> {
		const discovered: ManagedWorkerSessionSnapshot[] = [];

		for (const generation of listTerminalWorkerGenerations()) {
			const worker = this.getOrCreateWorker(generation);
			const connected = await worker.client.tryConnectAndAuthenticate();
			if (!connected) {
				worker.client.dispose();
				this.workers.delete(generation);
				continue;
			}

			try {
				const sessions = await worker.client.listSessions();
				discovered.push({
					generation: worker.generation,
					state: worker.state,
					sessions: sessions.sessions,
				});
			} catch (error) {
				this.options.log("warn", "Failed to recover existing worker", {
					generation,
					error: error instanceof Error ? error.message : String(error),
				});
				worker.client.dispose();
				this.workers.delete(generation);
			}
		}

		return discovered;
	}

	async shutdownDrainedWorkers({
		hasRoutedSessions,
	}: {
		hasRoutedSessions: (generation: string) => boolean;
	}): Promise<void> {
		for (const worker of [...this.workers.values()]) {
			if (worker.state !== "draining") continue;
			if (hasRoutedSessions(worker.generation)) continue;

			this.options.log("info", "Retiring drained worker", {
				generation: worker.generation,
			});

			await worker.client
				.shutdownIfRunning({ killSessions: false })
				.catch(() => {
					// Best-effort shutdown; the worker may have already exited.
				});
			worker.client.dispose();
			this.workers.delete(worker.generation);
		}
	}

	async shutdownAllWorkers({
		killSessions,
	}: {
		killSessions: boolean;
	}): Promise<void> {
		for (const worker of [...this.workers.values()]) {
			await worker.client
				.shutdownIfRunning({ killSessions })
				.catch(() => ({ wasRunning: false }));
			worker.client.dispose();
		}
		this.workers.clear();
		this.preferredGeneration = null;
	}

	clear(): void {
		for (const worker of this.workers.values()) {
			worker.client.dispose();
		}
		this.workers.clear();
		this.preferredGeneration = null;
	}

	private getOrCreateWorker(generation: string): ManagedTerminalWorker {
		const existing = this.workers.get(generation);
		if (existing) {
			return existing;
		}

		const worker = this.createWorker(generation);
		this.workers.set(generation, worker);
		return worker;
	}

	private createWorker(generation: string): ManagedTerminalWorker {
		const runtimePaths = getTerminalWorkerRuntimePaths(generation);
		const worker = {
			generation,
			state: "draining" as SupervisorWorkerState,
			client: new TerminalDaemonClient({
				daemonName: `terminal-worker:${generation}`,
				daemonScriptPath: this.options.workerScriptPath,
				runtimePaths,
				spawnArguments: this.options.workerSpawnArguments,
				spawnEnv: {
					[TERMINAL_WORKER_GENERATION_ENV]: generation,
				},
			}),
			runtimePaths,
		};

		worker.client.on("data", (sessionId, data) => {
			this.options.onData(generation, sessionId, data);
		});
		worker.client.on("exit", (sessionId, exitCode, signal) => {
			this.options.onExit(generation, sessionId, exitCode, signal);
		});
		worker.client.on("terminalError", (sessionId, error, code) => {
			this.options.onTerminalError(generation, sessionId, error, code);
		});
		worker.client.on("disconnected", () => {
			this.options.onDisconnected(generation);
		});
		worker.client.on("error", (error) => {
			this.options.onError(generation, error);
		});

		return worker;
	}
}
