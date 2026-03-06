/**
 * Git Worker Pool
 *
 * Main-thread orchestrator for offloading heavy git reads to worker_threads.
 * Features:
 * - Bounded concurrency pool
 * - Task coalescing (same dedupeKey joins in-flight task)
 * - Latest-wins for repeated status requests
 * - Per-task timeout with cancellation
 * - Worker crash isolation with automatic restart
 * - Backpressure (queue cap)
 * - Observability metrics
 */

import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import type {
	GitTask,
	GitTaskPayloads,
	GitTaskResults,
	GitTaskType,
	GitWorkerMetrics,
	GitWorkerPoolConfig,
	WorkerRequest,
	WorkerResponse,
} from "./types";
import { DEFAULT_POOL_CONFIG } from "./types";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface PendingTask<T extends GitTaskType = GitTaskType> {
	task: GitTask<T>;
	resolve: (result: GitTaskResults[T]) => void;
	reject: (error: Error) => void;
	generation: number;
	timer?: ReturnType<typeof setTimeout>;
}

interface WorkerSlot {
	worker: Worker;
	busy: boolean;
	currentTaskId: string | null;
}

// ---------------------------------------------------------------------------
// Pool implementation
// ---------------------------------------------------------------------------

export class GitWorkerPool {
	private readonly config: GitWorkerPoolConfig;
	private readonly workerScriptPath: string;
	private slots: WorkerSlot[] = [];
	private queue: PendingTask[] = [];
	private inFlight = new Map<string, PendingTask>();
	/** dedupeKey → { taskId, generation } for coalescing */
	private dedupeMap = new Map<
		string,
		{ taskId: string; generation: number; subscribers: PendingTask[] }
	>();
	/** dedupeKey → monotonic generation counter for latest-wins */
	private generationCounters = new Map<string, number>();
	private metrics: GitWorkerMetrics = {
		tasksSubmitted: 0,
		tasksCompleted: 0,
		tasksFailed: 0,
		tasksTimedOut: 0,
		tasksCoalesced: 0,
		tasksCancelled: 0,
		workerRestarts: 0,
		currentQueueSize: 0,
		currentActiveWorkers: 0,
	};
	private destroyed = false;

	constructor(
		workerScriptPath: string,
		config: Partial<GitWorkerPoolConfig> = {},
	) {
		this.config = { ...DEFAULT_POOL_CONFIG, ...config };
		this.workerScriptPath = workerScriptPath;
		this.initWorkers();
	}

	// -----------------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------------

	/**
	 * Submit a typed task to the worker pool.
	 * Returns a promise that resolves with the task result.
	 */
	submit<T extends GitTaskType>(
		taskType: T,
		payload: GitTaskPayloads[T],
		options: {
			dedupeKey: string;
			timeoutMs?: number;
		},
	): Promise<GitTaskResults[T]> {
		if (this.destroyed) {
			return Promise.reject(new Error("Worker pool is destroyed"));
		}

		this.metrics.tasksSubmitted++;
		const { dedupeKey, timeoutMs = this.config.defaultTimeoutMs } = options;

		// Bump generation for this dedupe key
		const generation = (this.generationCounters.get(dedupeKey) ?? 0) + 1;
		this.generationCounters.set(dedupeKey, generation);

		const task: GitTask<T> = {
			id: randomUUID(),
			taskType,
			payload,
			dedupeKey,
			timeoutMs,
		};

		// Check coalescing: if there's an in-flight task with the same dedupeKey,
		// subscribe to its result instead of queuing a new one.
		const existing = this.dedupeMap.get(dedupeKey);
		if (existing) {
			this.metrics.tasksCoalesced++;
			this.log(
				`Coalescing task ${task.id} onto ${existing.taskId} (key=${dedupeKey})`,
			);

			return new Promise<GitTaskResults[T]>((resolve, reject) => {
				const pending: PendingTask<T> = {
					task,
					resolve,
					reject,
					generation,
				};
				existing.subscribers.push(pending as unknown as PendingTask);
			});
		}

		// Backpressure check
		if (this.queue.length >= this.config.maxQueueSize) {
			this.metrics.tasksFailed++;
			return Promise.reject(
				new Error(
					`Worker pool queue full (${this.config.maxQueueSize} tasks). Try again later.`,
				),
			);
		}

		return new Promise<GitTaskResults[T]>((resolve, reject) => {
			const pending: PendingTask<T> = {
				task,
				resolve,
				reject,
				generation,
			};

			// Register in dedupe map
			this.dedupeMap.set(dedupeKey, {
				taskId: task.id,
				generation,
				subscribers: [],
			});

			this.queue.push(pending as unknown as PendingTask);
			this.metrics.currentQueueSize = this.queue.length;
			this.drain();
		});
	}

	/**
	 * Cancel all pending tasks for a given dedupe key prefix.
	 * In-flight tasks are NOT cancelled (they'll complete but results are dropped).
	 */
	cancelByPrefix(prefix: string): void {
		// Cancel queued tasks
		const remaining: PendingTask[] = [];
		for (const pending of this.queue) {
			if (pending.task.dedupeKey.startsWith(prefix)) {
				this.metrics.tasksCancelled++;
				pending.reject(new Error("Task cancelled"));
				if (pending.timer) clearTimeout(pending.timer);
				this.dedupeMap.delete(pending.task.dedupeKey);
			} else {
				remaining.push(pending);
			}
		}
		this.queue = remaining;
		this.metrics.currentQueueSize = this.queue.length;

		// Mark in-flight tasks as stale by bumping generation
		for (const [key] of this.dedupeMap) {
			if (key.startsWith(prefix)) {
				const gen = (this.generationCounters.get(key) ?? 0) + 1;
				this.generationCounters.set(key, gen);
			}
		}
	}

	getMetrics(): Readonly<GitWorkerMetrics> {
		this.metrics.currentQueueSize = this.queue.length;
		this.metrics.currentActiveWorkers = this.slots.filter((s) => s.busy).length;
		return { ...this.metrics };
	}

	async destroy(): Promise<void> {
		this.destroyed = true;

		// Reject all queued tasks
		for (const pending of this.queue) {
			pending.reject(new Error("Worker pool destroyed"));
			if (pending.timer) clearTimeout(pending.timer);
		}
		this.queue = [];

		// Reject all in-flight tasks
		for (const [, pending] of this.inFlight) {
			pending.reject(new Error("Worker pool destroyed"));
			if (pending.timer) clearTimeout(pending.timer);
		}
		this.inFlight.clear();
		this.dedupeMap.clear();

		// Terminate all workers
		const terminations = this.slots.map((slot) => slot.worker.terminate());
		await Promise.allSettled(terminations);
		this.slots = [];
	}

	// -----------------------------------------------------------------------
	// Worker lifecycle
	// -----------------------------------------------------------------------

	private initWorkers(): void {
		for (let i = 0; i < this.config.maxWorkers; i++) {
			this.slots.push(this.createWorkerSlot());
		}
	}

	private createWorkerSlot(): WorkerSlot {
		const worker = new Worker(this.workerScriptPath);
		const slot: WorkerSlot = {
			worker,
			busy: false,
			currentTaskId: null,
		};

		worker.on("message", (response: WorkerResponse) => {
			this.handleWorkerResponse(slot, response);
		});

		worker.on("error", (err) => {
			console.error("[git-worker] Worker error:", err.message);
			this.handleWorkerCrash(slot);
		});

		worker.on("exit", (code) => {
			if (this.destroyed) return;
			if (code !== 0 || slot.busy) {
				console.warn(
					`[git-worker] Worker exited with code ${code}${slot.busy ? " (had in-flight task)" : ""}, restarting...`,
				);
				this.handleWorkerCrash(slot);
			}
		});

		return slot;
	}

	private handleWorkerCrash(slot: WorkerSlot): void {
		// Reject the in-flight task if any
		if (slot.currentTaskId) {
			const pending = this.inFlight.get(slot.currentTaskId);
			if (pending) {
				this.metrics.tasksFailed++;
				this.resolveTask(pending, undefined, new Error("Worker crashed"));
				this.inFlight.delete(slot.currentTaskId);
			}
		}

		// Replace the crashed worker
		if (!this.destroyed) {
			this.metrics.workerRestarts++;
			const idx = this.slots.indexOf(slot);
			if (idx !== -1) {
				const newSlot = this.createWorkerSlot();
				this.slots[idx] = newSlot;
				this.drain();
			}
		}
	}

	// -----------------------------------------------------------------------
	// Task dispatch
	// -----------------------------------------------------------------------

	private drain(): void {
		while (this.queue.length > 0) {
			const slot = this.slots.find((s) => !s.busy);
			if (!slot) break;

			const pending = this.queue.shift();
			if (!pending) break;
			this.metrics.currentQueueSize = this.queue.length;

			// Check if this task's generation is stale (latest-wins)
			const currentGen =
				this.generationCounters.get(pending.task.dedupeKey) ?? 0;
			if (pending.generation < currentGen) {
				this.log(
					`Dropping stale task ${pending.task.id} (gen=${pending.generation}, current=${currentGen})`,
				);
				this.metrics.tasksCancelled++;
				pending.reject(new Error("Task superseded by newer request"));
				this.dedupeMap.delete(pending.task.dedupeKey);
				continue;
			}

			this.dispatch(slot, pending);
		}
	}

	private dispatch(slot: WorkerSlot, pending: PendingTask): void {
		slot.busy = true;
		slot.currentTaskId = pending.task.id;
		this.inFlight.set(pending.task.id, pending);

		// Set up timeout
		pending.timer = setTimeout(() => {
			this.log(
				`Task ${pending.task.id} timed out after ${pending.task.timeoutMs}ms`,
			);
			this.metrics.tasksTimedOut++;

			// Terminate and replace the worker
			slot.worker.terminate().catch(() => {});
			this.inFlight.delete(pending.task.id);
			this.resolveTask(
				pending,
				undefined,
				new Error(`Task timed out after ${pending.task.timeoutMs}ms`),
			);

			// Replace worker
			if (!this.destroyed) {
				this.metrics.workerRestarts++;
				const idx = this.slots.indexOf(slot);
				if (idx !== -1) {
					this.slots[idx] = this.createWorkerSlot();
					this.drain();
				}
			}
		}, pending.task.timeoutMs);

		const request: WorkerRequest = {
			id: pending.task.id,
			taskType: pending.task.taskType,
			payload: pending.task.payload,
		};

		this.log(
			`Dispatching ${pending.task.taskType} (id=${pending.task.id}, key=${pending.task.dedupeKey})`,
		);
		slot.worker.postMessage(request);
	}

	// -----------------------------------------------------------------------
	// Response handling
	// -----------------------------------------------------------------------

	private handleWorkerResponse(
		slot: WorkerSlot,
		response: WorkerResponse,
	): void {
		slot.busy = false;
		slot.currentTaskId = null;

		const pending = this.inFlight.get(response.id);
		if (!pending) {
			// Response for an already-timed-out or cancelled task
			return;
		}

		this.inFlight.delete(response.id);
		if (pending.timer) clearTimeout(pending.timer);

		// Check if result is stale (latest-wins)
		const currentGen = this.generationCounters.get(pending.task.dedupeKey) ?? 0;
		if (pending.generation < currentGen) {
			this.log(
				`Dropping stale result for ${pending.task.id} (gen=${pending.generation}, current=${currentGen})`,
			);
			this.metrics.tasksCancelled++;
			this.resolveTask(
				pending,
				undefined,
				new Error("Result superseded by newer request"),
			);
		} else if (response.ok) {
			this.metrics.tasksCompleted++;
			this.log(
				`Completed ${pending.task.taskType} (id=${pending.task.id}) in ${response.durationMs.toFixed(0)}ms`,
			);
			this.resolveTask(pending, response.result, undefined);
		} else {
			this.metrics.tasksFailed++;
			const error = new Error(response.error);
			if (response.code) {
				(error as Error & { code?: string }).code = response.code;
			}
			this.resolveTask(pending, undefined, error);
		}

		// Continue draining the queue
		this.drain();
	}

	private resolveTask(
		pending: PendingTask,
		result: GitTaskResults[GitTaskType] | undefined,
		error: Error | undefined,
	): void {
		const dedupeEntry = this.dedupeMap.get(pending.task.dedupeKey);

		if (error) {
			pending.reject(error);
			// Also reject all subscribers
			if (dedupeEntry) {
				for (const sub of dedupeEntry.subscribers) {
					sub.reject(error);
				}
			}
		} else {
			// biome-ignore lint/style/noNonNullAssertion: result is defined when error is undefined
			pending.resolve(result!);
			// Also resolve all subscribers
			if (dedupeEntry) {
				for (const sub of dedupeEntry.subscribers) {
					// biome-ignore lint/style/noNonNullAssertion: result is defined when error is undefined
					sub.resolve(result!);
				}
			}
		}

		// Clean up dedupe entry
		if (dedupeEntry) {
			this.dedupeMap.delete(pending.task.dedupeKey);
		}
	}

	// -----------------------------------------------------------------------
	// Debug logging
	// -----------------------------------------------------------------------

	private log(msg: string): void {
		if (this.config.debug) {
			console.log(`[git-worker] ${msg}`);
		}
	}
}
