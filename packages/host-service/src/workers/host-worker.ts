// host-worker thread entry: dispatch loop over the static task registry.
// Adding a worker domain = create a task module and import it here; the
// registry is fixed at build time (you cannot ship closures to a worker).

import { parentPort } from "node:worker_threads";
import type { WorkerTaskDefinition } from "./define-worker-task.ts";
import { gitTasks } from "./tasks/git.ts";
import {
	serializeWorkerError,
	type WorkerTaskRequestMessage,
} from "./worker-task-protocol.ts";

if (!parentPort) {
	throw new Error("host-worker must be run in a worker thread");
}

// biome-ignore lint/suspicious/noExplicitAny: heterogenous task registry; typing is enforced at the defineWorkerTask/run() boundary
const registry = new Map<string, WorkerTaskDefinition<any, unknown>>();
for (const def of [...gitTasks]) {
	if (registry.has(def.type)) {
		throw new Error(`duplicate worker task type: ${def.type}`);
	}
	registry.set(def.type, def);
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
		const def = registry.get(task.taskType);
		if (!def) {
			throw new Error(`unknown worker task type: ${task.taskType}`);
		}
		const result = await def.handler(task.payload);
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
