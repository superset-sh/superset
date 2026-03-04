import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import type {
	SerializedWorkerError,
	WorkerTaskRequestMessage,
	WorkerTaskResponseMessage,
} from "./worker-task-protocol";

export class WorkerTaskError extends Error {
	public readonly code?: string;

	constructor(message: string, error?: SerializedWorkerError) {
		super(message);
		this.name = error?.name ?? "WorkerTaskError";
		this.code = error?.code;
		this.stack = error?.stack ?? this.stack;
	}
}

export class WorkerTaskAbortedError extends Error {
	constructor(message = "Worker task aborted") {
		super(message);
		this.name = "WorkerTaskAbortedError";
	}
}

type QueueStrategy = "fifo" | "coalesce" | "latest-wins";

interface WorkerTaskOptions {
	dedupeKey?: string;
	timeoutMs?: number;
	signal?: AbortSignal;
	strategy?: QueueStrategy;
}

interface WorkerTaskRunnerOptions {
	workerScriptPath: string;
	concurrency: number;
	name?: string;
	debug?: boolean;
}

interface WorkerSlot {
	id: number;
	worker: Worker;
	activeTaskId: string | null;
	terminating: boolean;
}

interface QueuedTask {
	taskId: string;
	taskType: string;
	payload: unknown;
	resolve: (value: unknown) => void;
	reject: (reason?: unknown) => void;
	dedupeKey?: string;
	strategy: QueueStrategy;
	generation: number;
	abortSignal?: AbortSignal;
	abortHandler?: () => void;
	timeoutMs: number;
	timeoutHandle?: NodeJS.Timeout;
	slotId?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

export class WorkerTaskRunner {
	private readonly workerScriptPath: string;
	private readonly concurrency: number;
	private readonly name: string;
	private readonly debug: boolean;
	private readonly workerSlots = new Map<number, WorkerSlot>();
	private readonly queue: string[] = [];
	private readonly tasks = new Map<string, QueuedTask>();
	private readonly inFlightByKey = new Map<string, Promise<unknown>>();
	private readonly generationByKey = new Map<string, number>();
	private workerCounter = 0;
	private disposed = false;

	constructor(options: WorkerTaskRunnerOptions) {
		this.workerScriptPath = options.workerScriptPath;
		this.concurrency = Math.max(1, options.concurrency);
		this.name = options.name ?? "worker-runner";
		this.debug = options.debug ?? false;
	}

	runTask<TResult>(
		taskType: string,
		payload: unknown,
		options?: WorkerTaskOptions,
	): Promise<TResult> {
		if (this.disposed) {
			return Promise.reject(
				new WorkerTaskError(`[${this.name}] Runner has been disposed`),
			);
		}

		const strategy = options?.strategy ?? "fifo";
		const dedupeKey = options?.dedupeKey;
		const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const useGeneration = strategy === "latest-wins" && Boolean(dedupeKey);

		if (strategy === "coalesce" && dedupeKey) {
			const inFlight = this.inFlightByKey.get(dedupeKey);
			if (inFlight) {
				return inFlight as Promise<TResult>;
			}
		}

		const generation =
			useGeneration && dedupeKey
				? (this.generationByKey.get(dedupeKey) ?? 0) + 1
				: 0;
		if (useGeneration && dedupeKey) {
			this.generationByKey.set(dedupeKey, generation);
		}

		const taskId = randomUUID();

		const taskPromise = new Promise<TResult>((resolve, reject) => {
			const task: QueuedTask = {
				taskId,
				taskType,
				payload,
				resolve: (value) => resolve(value as TResult),
				reject,
				dedupeKey,
				strategy,
				generation,
				abortSignal: options?.signal,
				timeoutMs,
			};

			if (task.abortSignal) {
				const abortTask = () => this.abortTask(task.taskId);
				task.abortHandler = abortTask;
				task.abortSignal.addEventListener("abort", abortTask, { once: true });
			}

			this.tasks.set(taskId, task);

			if (strategy === "latest-wins" && dedupeKey) {
				this.dropQueuedTasksByKey(dedupeKey, taskId);
			}

			this.queue.push(taskId);
			this.drainQueue();
		});

		if (dedupeKey && (strategy === "coalesce" || strategy === "latest-wins")) {
			this.inFlightByKey.set(dedupeKey, taskPromise);
		}

		return taskPromise.finally(() => {
			if (dedupeKey && this.inFlightByKey.get(dedupeKey) === taskPromise) {
				this.inFlightByKey.delete(dedupeKey);
			}
			if (
				useGeneration &&
				dedupeKey &&
				this.generationByKey.get(dedupeKey) === generation
			) {
				this.generationByKey.delete(dedupeKey);
			}
		});
	}

	async dispose(): Promise<void> {
		this.disposed = true;

		for (const taskId of [...this.queue]) {
			this.rejectTask(
				taskId,
				new WorkerTaskAbortedError("Worker runner disposed"),
			);
		}
		this.queue.length = 0;

		for (const slot of this.workerSlots.values()) {
			slot.terminating = true;
			if (slot.activeTaskId) {
				this.rejectTask(
					slot.activeTaskId,
					new WorkerTaskAbortedError("Worker runner disposed"),
				);
			}
			await slot.worker.terminate();
		}

		this.workerSlots.clear();
	}

	private spawnWorker(): void {
		const slotId = ++this.workerCounter;
		const worker = new Worker(this.workerScriptPath);
		const slot: WorkerSlot = {
			id: slotId,
			worker,
			activeTaskId: null,
			terminating: false,
		};

		worker.on("message", (message: unknown) => {
			this.handleWorkerMessage(slot.id, message);
		});

		worker.on("error", (error) => {
			this.log(`worker ${slot.id} error: ${error.message}`);
			this.handleWorkerFailure(slot.id, new WorkerTaskError(error.message));
		});

		worker.on("exit", (code) => {
			if (this.disposed) return;
			if (code !== 0) {
				this.log(`worker ${slot.id} exited with code ${code}`);
			}
			this.handleWorkerFailure(
				slot.id,
				new WorkerTaskError(`Worker exited with code ${code}`),
			);
		});

		this.workerSlots.set(slot.id, slot);
	}

	private drainQueue(): void {
		if (this.disposed) return;
		if (this.queue.length === 0) return;
		this.ensureWorkerCapacity();

		for (const slot of this.workerSlots.values()) {
			if (slot.activeTaskId || slot.terminating) continue;
			if (this.queue.length === 0) break;

			const nextTaskId = this.queue.shift();
			if (!nextTaskId) continue;
			const task = this.tasks.get(nextTaskId);
			if (!task) continue;

			if (task.abortSignal?.aborted) {
				this.rejectTask(task.taskId, new WorkerTaskAbortedError());
				continue;
			}

			slot.activeTaskId = task.taskId;
			task.slotId = slot.id;
			task.timeoutHandle = setTimeout(() => {
				this.handleTaskTimeout(task.taskId);
			}, task.timeoutMs);

			const request: WorkerTaskRequestMessage = {
				kind: "task",
				taskId: task.taskId,
				taskType: task.taskType,
				payload: task.payload,
			};
			slot.worker.postMessage(request);
		}
	}

	private handleWorkerMessage(slotId: number, message: unknown): void {
		const slot = this.workerSlots.get(slotId);
		if (!slot) return;

		if (!this.isWorkerResultMessage(message)) {
			return;
		}
		const response = message;

		if (slot.activeTaskId !== response.taskId) {
			this.log(
				`worker ${slot.id} sent unexpected task result ${response.taskId} (active: ${slot.activeTaskId ?? "none"})`,
			);
			return;
		}

		const task = this.tasks.get(response.taskId);
		if (!task) {
			this.log(
				`worker ${slot.id} reported result for missing active task ${response.taskId}; recycling worker`,
			);
			if (!slot.terminating) {
				slot.terminating = true;
				void slot.worker.terminate();
			}
			return;
		}

		this.clearTaskTimeout(task);
		slot.activeTaskId = null;

		if (response.ok) {
			if (
				task.strategy === "latest-wins" &&
				task.dedupeKey &&
				(this.generationByKey.get(task.dedupeKey) ?? 0) !== task.generation
			) {
				this.rejectTask(
					task.taskId,
					new WorkerTaskAbortedError("Task superseded by a newer request"),
				);
			} else {
				this.resolveTask(task.taskId, response.result);
			}
		} else {
			this.rejectTask(
				task.taskId,
				new WorkerTaskError(response.error.message, response.error),
			);
		}

		this.drainQueue();
	}

	private isWorkerResultMessage(
		message: unknown,
	): message is WorkerTaskResponseMessage {
		if (!message || typeof message !== "object") return false;
		const candidate = message as {
			kind?: unknown;
			taskId?: unknown;
			ok?: unknown;
			error?: unknown;
		};
		if (
			candidate.kind !== "result" ||
			typeof candidate.taskId !== "string" ||
			typeof candidate.ok !== "boolean"
		) {
			return false;
		}
		if (candidate.ok) return true;
		if (!candidate.error || typeof candidate.error !== "object") return false;
		const error = candidate.error as Partial<SerializedWorkerError>;
		return typeof error.name === "string" && typeof error.message === "string";
	}

	private handleTaskTimeout(taskId: string): void {
		const task = this.tasks.get(taskId);
		if (!task) return;

		this.rejectTask(
			taskId,
			new WorkerTaskError(
				`[${this.name}] Task "${task.taskType}" timed out after ${task.timeoutMs}ms`,
			),
		);

		if (task.slotId) {
			const slot = this.workerSlots.get(task.slotId);
			if (slot && !slot.terminating) {
				slot.terminating = true;
				void slot.worker.terminate();
				if (this.hasOutstandingWork()) {
					this.ensureWorkerCapacity();
					this.drainQueue();
				}
			}
		}
	}

	private abortTask(taskId: string): void {
		const task = this.tasks.get(taskId);
		if (!task) return;

		this.rejectTask(taskId, new WorkerTaskAbortedError());

		if (task.slotId) {
			const slot = this.workerSlots.get(task.slotId);
			if (slot && !slot.terminating) {
				slot.terminating = true;
				void slot.worker.terminate();
				if (this.hasOutstandingWork()) {
					this.ensureWorkerCapacity();
					this.drainQueue();
				}
			}
		}
	}

	private handleWorkerFailure(slotId: number, error: WorkerTaskError): void {
		const slot = this.workerSlots.get(slotId);
		if (!slot) return;

		const activeTaskId = slot.activeTaskId;
		this.workerSlots.delete(slot.id);

		if (activeTaskId) {
			this.rejectTask(activeTaskId, error);
		}

		if (!this.disposed && this.hasOutstandingWork()) {
			this.ensureWorkerCapacity();
			this.drainQueue();
		}
	}

	private dropQueuedTasksByKey(dedupeKey: string, keepTaskId: string): void {
		for (let i = this.queue.length - 1; i >= 0; i--) {
			const queuedTaskId = this.queue[i];
			const queuedTask = this.tasks.get(queuedTaskId);
			if (!queuedTask) continue;
			if (queuedTask.taskId === keepTaskId) continue;
			if (queuedTask.dedupeKey !== dedupeKey) continue;

			this.queue.splice(i, 1);
			this.rejectTask(
				queuedTask.taskId,
				new WorkerTaskAbortedError("Task superseded by a newer request"),
			);
		}
	}

	private resolveTask(taskId: string, result: unknown): void {
		const task = this.tasks.get(taskId);
		if (!task) return;
		this.cleanupTask(task);
		task.resolve(result);
	}

	private rejectTask(taskId: string, reason: unknown): void {
		const task = this.tasks.get(taskId);
		if (!task) return;

		const queueIndex = this.queue.indexOf(taskId);
		if (queueIndex >= 0) {
			this.queue.splice(queueIndex, 1);
		}

		const slot = task.slotId ? this.workerSlots.get(task.slotId) : null;
		if (slot?.activeTaskId === taskId) {
			slot.activeTaskId = null;
		}

		this.cleanupTask(task);
		task.reject(reason);
	}

	private cleanupTask(task: QueuedTask): void {
		this.clearTaskTimeout(task);
		if (task.abortSignal && task.abortHandler) {
			task.abortSignal.removeEventListener("abort", task.abortHandler);
		}
		this.tasks.delete(task.taskId);
	}

	private clearTaskTimeout(task: QueuedTask): void {
		if (task.timeoutHandle) {
			clearTimeout(task.timeoutHandle);
			task.timeoutHandle = undefined;
		}
	}

	private log(message: string): void {
		if (!this.debug) return;
		console.log(`[WorkerTaskRunner:${this.name}] ${message}`);
	}

	private ensureWorkerCapacity(): void {
		while (this.getActiveSlotCount() < this.concurrency) {
			this.spawnWorker();
		}
	}

	private getActiveSlotCount(): number {
		let count = 0;
		for (const slot of this.workerSlots.values()) {
			if (!slot.terminating) {
				count += 1;
			}
		}
		return count;
	}

	private hasOutstandingWork(): boolean {
		return this.tasks.size > 0 || this.queue.length > 0;
	}
}

export type { WorkerTaskOptions };
