import { parentPort } from "node:worker_threads";
import { executeGitTask } from "../lib/trpc/routers/changes/workers/git-task-handlers";
import type { GitTaskType } from "../lib/trpc/routers/changes/workers/git-task-types";
import { setGitTaskAbortSignal } from "../lib/trpc/routers/workspaces/utils/git-client";
import { classifyEnvironmentalGitError } from "../lib/trpc/routers/workspaces/utils/git-errors";
import {
	serializeWorkerError,
	type WorkerTaskCancelMessage,
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

function isWorkerTaskCancelMessage(
	message: unknown,
): message is WorkerTaskCancelMessage {
	if (!message || typeof message !== "object") {
		return false;
	}
	const candidate = message as Partial<WorkerTaskCancelMessage>;
	return candidate.kind === "cancel" && typeof candidate.taskId === "string";
}

// The runner hands this thread one task at a time. Aborting kills the git
// processes the task spawned while this thread is still alive to reap them;
// the runner used to terminate the thread instead, which left them running
// and, once they exited, zombies for the life of the app.
let activeTask: { taskId: string; abort: AbortController } | null = null;

parentPort.on("message", async (message: unknown) => {
	if (isWorkerTaskCancelMessage(message)) {
		if (activeTask?.taskId === message.taskId) {
			activeTask.abort.abort();
		}
		return;
	}
	if (!isWorkerTaskRequestMessage(message)) return;
	const task = message;
	const abort = new AbortController();
	activeTask = { taskId: task.taskId, abort };
	setGitTaskAbortSignal(abort.signal);

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
			error: serializeWorkerError(translateRawGitError(error)),
		});
	} finally {
		if (activeTask?.taskId === task.taskId) {
			activeTask = null;
			setGitTaskAbortSignal(undefined);
		}
	}
});

// Task handlers call simple-git directly in places; classify its raw errors
// here so every task crosses the boundary in the domain vocabulary.
function translateRawGitError(error: unknown): unknown {
	return classifyEnvironmentalGitError(error) ?? error;
}
