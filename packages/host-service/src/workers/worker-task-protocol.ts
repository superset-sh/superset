// Wire protocol between WorkerTaskRunner and the host-worker thread.
// Ported from apps/desktop/src/lib/trpc/workers/worker-task-protocol.ts
// (v1 desktop keeps its own copy; it retires with v1).

export interface SerializedWorkerError {
	name: string;
	message: string;
	stack?: string;
	code?: string;
}

export interface WorkerTaskRequestMessage {
	kind: "task";
	taskId: string;
	taskType: string;
	payload: unknown;
}

/** Main-thread → worker: SIGKILL + reap any in-flight child processes, then
 * exit the thread voluntarily. Sent before a hard terminate() so children
 * don't leak as zombies — see WorkerTaskRunner.shutdownSlot (#6152). */
export interface WorkerShutdownRequestMessage {
	kind: "shutdown";
}

export function isWorkerShutdownRequestMessage(
	message: unknown,
): message is WorkerShutdownRequestMessage {
	return (
		typeof message === "object" &&
		message !== null &&
		(message as { kind?: unknown }).kind === "shutdown"
	);
}

/** Worker → main thread: the handler has entered a named phase.
 *
 * The task budget is enforced by a timer in the parent, which otherwise has
 * no idea which step of a multi-step handler was in flight when it expired —
 * and the worker is retired straight afterwards, so there is nothing left to
 * ask. This carries that one fact out ahead of the hang. Best-effort: a phase
 * that arrives after the timeout is ignored. */
export interface WorkerTaskPhaseMessage {
	kind: "phase";
	taskId: string;
	phase: string;
}

export function isWorkerTaskPhaseMessage(
	message: unknown,
): message is WorkerTaskPhaseMessage {
	if (!message || typeof message !== "object") return false;
	const candidate = message as Partial<WorkerTaskPhaseMessage>;
	return (
		candidate.kind === "phase" &&
		typeof candidate.taskId === "string" &&
		typeof candidate.phase === "string"
	);
}

export type WorkerTaskResponseMessage =
	| {
			kind: "result";
			taskId: string;
			ok: true;
			result: unknown;
	  }
	| {
			kind: "result";
			taskId: string;
			ok: false;
			error: SerializedWorkerError;
	  };

export function serializeWorkerError(error: unknown): SerializedWorkerError {
	if (error instanceof Error) {
		const serialized: SerializedWorkerError = {
			name: error.name,
			message: error.message,
			stack: error.stack,
		};

		if ("code" in error && typeof error.code === "string") {
			serialized.code = error.code;
		}

		return serialized;
	}

	return {
		name: "Error",
		message: String(error),
	};
}
