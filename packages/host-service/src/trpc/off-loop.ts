// offLoop() — resolver factory that makes a procedure body a worker task.
// `prepare` runs on the event loop (ctx reads, credential/env resolution)
// and returns the task input as PLAIN DATA; the task then executes in the
// host worker pool, so its subprocess/fs work never blocks the loop. Prefer
// this for new procedures over spawning in the resolver — the
// no-main-loop-blocking ratchet only catches regressions after the fact.

import type { HostServiceContext } from "../types";
import type { WorkerTaskDefinition } from "../workers/define-worker-task";
import {
	getHostWorkerPool,
	type HostWorkerPool,
} from "../workers/host-worker-pool";
import type { WorkerTaskOptions } from "../workers/WorkerTaskRunner";

export interface OffLoopArgs<TInput> {
	ctx: HostServiceContext;
	input: TInput;
	/** Provided by tRPC on request abort; forwarded to the task when set. */
	signal?: AbortSignal;
}

export interface OffLoopSpec<TInput, TTaskInput, TResult> {
	task: WorkerTaskDefinition<TTaskInput, TResult>;
	/** On-loop stage: gather the ctx-derived data the worker needs. */
	prepare: (args: OffLoopArgs<TInput>) => TTaskInput | Promise<TTaskInput>;
	/** Per-call pool options (timeout, coalescing). The caller's abort signal
	 * is forwarded automatically. */
	options?: (
		args: OffLoopArgs<TInput>,
	) => Omit<WorkerTaskOptions, "signal"> | undefined;
}

export function createOffLoop(getPool: () => Pick<HostWorkerPool, "run">) {
	return function offLoop<TInput, TTaskInput, TResult>(
		spec: OffLoopSpec<TInput, TTaskInput, TResult>,
	): (args: OffLoopArgs<TInput>) => Promise<TResult> {
		return async (args) => {
			const taskInput = await spec.prepare(args);
			return getPool().run(spec.task, taskInput, {
				...spec.options?.(args),
				signal: args.signal,
			});
		};
	};
}

export const offLoop = createOffLoop(getHostWorkerPool);
