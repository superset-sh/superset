import { parentPort } from "node:worker_threads";
import { executeGitTask } from "../lib/trpc/routers/changes/workers/git-task-handlers";
import type { GitTaskType } from "../lib/trpc/routers/changes/workers/git-task-types";
import {
	serializeWorkerError,
	type WorkerTaskRequestMessage,
} from "../lib/trpc/workers/worker-task-protocol";

if (!parentPort) {
	throw new Error("git-task-worker must be run in a worker thread");
}

function isWorkerTaskRequestMessage(
	message: unknown,
): message is WorkerTaskRequestMessage {
	if (!message || typeof message !== "object") {
		return false;
	}
	const candidate = message as Partial<WorkerTaskRequestMessage>;
	return (
		candidate.kind === "task" &&
		typeof candidate.taskId === "string" &&
		typeof candidate.taskType === "string"
	);
}

parentPort.on("message", async (message: unknown) => {
	if (!isWorkerTaskRequestMessage(message)) return;
	const task = message;

	try {
		const result = await executeGitTask(
			task.taskType as GitTaskType,
			task.payload as never,
		);
		parentPort?.postMessage({
			kind: "result",
			taskId: task.taskId,
			ok: true,
			result,
		});
	} catch (error) {
		parentPort?.postMessage({
			kind: "result",
			taskId: task.taskId,
			ok: false,
			error: serializeWorkerError(error),
		});
	}
});
