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

/**
 * The caller has given up on the task (timeout, abort). The worker kills what
 * the task spawned and still reports a result for it, which is how the runner
 * knows the thread is free again.
 */
export interface WorkerTaskCancelMessage {
	kind: "cancel";
	taskId: string;
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
