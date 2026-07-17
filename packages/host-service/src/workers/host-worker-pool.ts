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
	WORKER_CRASH_ERROR_NAME,
	WorkerTaskError,
	type WorkerTaskOptions,
	WorkerTaskRunner,
} from "./WorkerTaskRunner.ts";

const DEFAULT_CONCURRENCY = Math.max(1, Math.min(4, cpus().length - 1));

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
		if (!runner) return def.handler(input);

		try {
			return await runner.runTask<TResult>(def.type, input, options);
		} catch (error) {
			if (
				error instanceof WorkerTaskError &&
				error.name === WORKER_CRASH_ERROR_NAME
			) {
				this.recordCrash();
				// The task died with the worker, not on its own merits — run it
				// inline so the caller sees a real result or a real error.
				return def.handler(input);
			}
			throw error;
		}
	}

	async dispose(): Promise<void> {
		const runner = this.runner;
		this.runner = null;
		await runner?.dispose();
	}

	private recordCrash(): void {
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
			const runner = this.runner;
			this.runner = null;
			void runner?.dispose();
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
