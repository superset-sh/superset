// HostWorkerPool — lazy singleton over WorkerTaskRunner with:
//  - script resolution mirroring daemon/singleton.ts (env override →
//    side-by-side host-worker.js → workspace dist fallback)
//  - inline fallback: missing bundle or crash-looping workers degrade to
//    running handlers on the main thread (current behavior), never failing
//    the caller because of pool infrastructure
//  - worker-crash retry: a task that dies with the worker is retried inline
//    once, so callers only ever see real handler errors

import { existsSync } from "node:fs";
// Shared with gitStatusRefreshLimiter's DEFAULT_CONCURRENCY intent: the
// limiter is the front-door queue for status refreshes; the pool must be
// able to execute what the limiter admits without queueing behind it.
import { cpus } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkerTaskDefinition } from "./define-worker-task.ts";
import {
	DEFAULT_TIMEOUT_MS,
	WORKER_CRASH_ERROR_NAME,
	WorkerTaskAbortedError,
	WorkerTaskError,
	type WorkerTaskOptions,
	WorkerTaskRunner,
} from "./WorkerTaskRunner.ts";

// min(4, cpus−1) matches gitStatusRefreshLimiter, +2 headroom so occasional
// non-limiter tasks (getCommitFiles) can't occupy every worker ahead of
// status refreshes. Idle reaping keeps the extra threads free when unused.
const DEFAULT_CONCURRENCY = Math.max(1, Math.min(4, cpus().length - 1)) + 2;

const IDLE_TIMEOUT_MS = 30_000;
const CRASH_BUDGET = 3;
const CRASH_WINDOW_MS = 60_000;

export function resolveHostWorkerScriptPath(): string | null {
	const override = process.env.SUPERSET_HOST_WORKER_SCRIPT_PATH;
	if (override) return existsSync(override) ? override : null;

	const here = path.dirname(fileURLToPath(import.meta.url));
	// Production (electron-vite / standalone dist): host-service.js and
	// host-worker.js are emitted side-by-side in the same dist directory.
	const sideBySide = path.resolve(here, "host-worker.js");
	if (existsSync(sideBySide)) return sideBySide;

	// Source-running fallback (`bun run` from packages/host-service): `here`
	// is `packages/host-service/src/workers/`; the built entry sits at
	// `packages/host-service/dist/host-worker.js` after `bun run build`.
	const workspaceDist = path.resolve(
		here,
		"..",
		"..",
		"dist",
		"host-worker.js",
	);
	if (existsSync(workspaceDist)) return workspaceDist;

	return null;
}

export class HostWorkerPool {
	private runner: WorkerTaskRunner | null = null;
	private inlineOnly = false;
	private warnedInline = false;
	private crashTimestamps: number[] = [];
	private readonly seenCrashErrors = new WeakSet<WorkerTaskError>();
	/** Coalesced callers share one inline crash-retry per dedupe key —
	 * otherwise a single worker death fans out into N duplicate inline runs. */
	private readonly inlineRetryByKey = new Map<string, Promise<unknown>>();
	/** Runners detached at circuit-open; disposed with the pool. */
	private readonly drainingRunners: WorkerTaskRunner[] = [];
	private readonly scriptPathResolver: () => string | null;
	private readonly concurrency: number;
	private readonly idleTimeoutMs: number;
	private readonly execArgv?: string[];

	constructor(options?: {
		scriptPathResolver?: () => string | null;
		concurrency?: number;
		idleTimeoutMs?: number;
		execArgv?: string[];
	}) {
		this.scriptPathResolver =
			options?.scriptPathResolver ?? resolveHostWorkerScriptPath;
		this.concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
		this.idleTimeoutMs = options?.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
		this.execArgv = options?.execArgv;
	}

	/** Exposed for tests. */
	getMode(): "worker" | "inline" {
		return this.inlineOnly || !this.getRunner() ? "inline" : "worker";
	}

	getRunner(): WorkerTaskRunner | null {
		if (this.inlineOnly) return null;
		if (this.runner) return this.runner;
		const scriptPath = this.scriptPathResolver();
		if (!scriptPath) {
			this.inlineOnly = true;
			this.warnInlineOnce(
				"host-worker bundle not found — running worker tasks inline on the main thread",
			);
			return null;
		}
		this.runner = new WorkerTaskRunner({
			workerScriptPath: scriptPath,
			concurrency: this.concurrency,
			name: "host-worker",
			idleTimeoutMs: this.idleTimeoutMs,
			execArgv: this.execArgv,
		});
		return this.runner;
	}

	async run<TInput, TResult>(
		def: WorkerTaskDefinition<TInput, TResult>,
		input: TInput,
		options?: WorkerTaskOptions,
	): Promise<TResult> {
		const runner = this.getRunner();
		if (!runner) return this.runInline(def, input, options);

		try {
			return await runner.runTask<TResult>(def.type, input, options);
		} catch (error) {
			if (
				error instanceof WorkerTaskError &&
				error.name === WORKER_CRASH_ERROR_NAME
			) {
				this.recordCrash(error);
				// The task died with the worker, not on its own merits — run it
				// inline so the caller sees a real result or a real error.
				const key =
					options?.strategy === "coalesce" && options.dedupeKey
						? options.dedupeKey
						: null;
				if (key) {
					const existing = this.inlineRetryByKey.get(key);
					if (existing) return existing as Promise<TResult>;
					const retry = this.runInline(def, input, options).finally(() => {
						this.inlineRetryByKey.delete(key);
					});
					this.inlineRetryByKey.set(key, retry);
					return retry;
				}
				return this.runInline(def, input, options);
			}
			throw error;
		}
	}

	/**
	 * Inline execution with the same caller-visible timeout/abort semantics as
	 * the worker path. The handler itself is not cancellable — like a worker
	 * task, it may keep running after the caller's promise settles.
	 */
	private async runInline<TInput, TResult>(
		def: WorkerTaskDefinition<TInput, TResult>,
		input: TInput,
		options?: WorkerTaskOptions,
	): Promise<TResult> {
		if (options?.signal?.aborted) throw new WorkerTaskAbortedError();

		return new Promise<TResult>((resolve, reject) => {
			let settled = false;
			const settle = (fn: () => void) => {
				if (settled) return;
				settled = true;
				cleanup();
				fn();
			};
			const onAbort = () => settle(() => reject(new WorkerTaskAbortedError()));
			// Same default and zero-means-instant semantics as the worker path.
			const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
			const timeoutHandle = setTimeout(
				() =>
					settle(() =>
						reject(
							new WorkerTaskError(
								`[host-worker] Task "${def.type}" timed out after ${timeoutMs}ms (inline)`,
							),
						),
					),
				timeoutMs,
			);
			const cleanup = () => {
				clearTimeout(timeoutHandle);
				options?.signal?.removeEventListener("abort", onAbort);
			};
			options?.signal?.addEventListener("abort", onAbort, { once: true });

			// Promise.resolve() wrapper: a synchronously-throwing handler must
			// route through settle() too, or the timer and abort listener leak.
			Promise.resolve()
				.then(() => def.handler(input))
				.then((result) => settle(() => resolve(result)))
				.catch((error) => settle(() => reject(error)));
		});
	}

	async dispose(): Promise<void> {
		const runners = [this.runner, ...this.drainingRunners.splice(0)];
		this.runner = null;
		await Promise.all(runners.map((r) => r?.dispose()));
	}

	private recordCrash(error: WorkerTaskError): void {
		// Coalesced callers all reject with the SAME error instance for one
		// worker death — count each underlying crash once, not per caller.
		if (this.seenCrashErrors.has(error)) return;
		this.seenCrashErrors.add(error);

		const now = Date.now();
		this.crashTimestamps = this.crashTimestamps.filter(
			(t) => now - t < CRASH_WINDOW_MS,
		);
		this.crashTimestamps.push(now);
		if (this.crashTimestamps.length >= CRASH_BUDGET && !this.inlineOnly) {
			this.inlineOnly = true;
			this.warnInlineOnce(
				`host-worker crashed ${CRASH_BUDGET}x within ${CRASH_WINDOW_MS / 1000}s — falling back to inline execution for the rest of this process`,
			);
			// Do NOT dispose the old runner: dispose() would reject its
			// outstanding tasks with abort errors that bypass the inline
			// retry. Detach it instead — in-flight tasks settle on their own
			// merits and the idle reaper terminates its workers afterward.
			// Queued tasks WOULD keep feeding fresh crashing workers, so
			// reject them with this same crash error: their callers take the
			// inline retry and seenCrashErrors keeps the accounting at one.
			if (this.runner) {
				this.drainingRunners.push(this.runner);
				this.runner.rejectQueuedTasks(error);
			}
			this.runner = null;
		}
	}

	private warnInlineOnce(message: string): void {
		if (this.warnedInline) return;
		this.warnedInline = true;
		console.warn(`[host-worker-pool] ${message}`);
	}
}

let pool: HostWorkerPool | null = null;

export function getHostWorkerPool(): HostWorkerPool {
	if (!pool) pool = new HostWorkerPool();
	return pool;
}
