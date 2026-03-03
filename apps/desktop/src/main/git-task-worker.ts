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

parentPort.on("message", async (message: unknown) => {
	const task = message as WorkerTaskRequestMessage;
	if (!task || task.kind !== "task") return;

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
