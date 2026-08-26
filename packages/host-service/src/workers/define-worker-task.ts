// Typed worker task definitions. A task module exports defs; the worker
// entry (host-worker.ts) imports them into its static registry, and callers
// pass the same def to HostWorkerPool.run() for end-to-end typing. The
// handler also runs in-process for the inline fallback, so defs must stay
// clone-safe and free of DB/event-bus/native imports (see
// no-native-worker-imports.test.ts).

/** Names the step a multi-step handler is about to start. The pool keeps the
 * last value and names it in the task's timeout error, so a handler that
 * hangs says where it hung. Single-step handlers ignore it. */
export type ReportTaskPhase = (phase: string) => void;

export interface WorkerTaskDefinition<TInput, TResult> {
	/** Namespaced as "<domain>/<task>", e.g. "git/getStatusSnapshot". */
	type: string;
	handler: (input: TInput, reportPhase?: ReportTaskPhase) => Promise<TResult>;
}

export function defineWorkerTask<TInput, TResult>(
	def: WorkerTaskDefinition<TInput, TResult>,
): WorkerTaskDefinition<TInput, TResult> {
	return def;
}
