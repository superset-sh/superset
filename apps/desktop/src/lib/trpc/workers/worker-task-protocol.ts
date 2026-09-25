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
