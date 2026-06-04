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
