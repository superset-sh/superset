// Test fixture: the task spawns child A and, from a microtask queued by A's
// exit event, spawns successor B. That lands B exactly in the window between
// the reaper observing an empty set and the worker exiting — the still-
// running-task race from the #6221 review. Every pid is appended to
// SPAWN_PID_FILE so the test can assert all of them were killed AND reaped.
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { parentPort } from "node:worker_threads";
import { killAndReapTrackedChildren } from "../worker-child-tracker.ts";
import { isWorkerShutdownRequestMessage } from "../worker-task-protocol.ts";

function spawnAndRecord(): ReturnType<typeof spawn> {
	const child = spawn("sleep", ["30"], { stdio: "ignore" });
	if (process.env.SPAWN_PID_FILE && child.pid) {
		appendFileSync(process.env.SPAWN_PID_FILE, `${child.pid}\n`);
	}
	return child;
}

parentPort?.on("message", async (message: unknown) => {
	if (isWorkerShutdownRequestMessage(message)) {
		await killAndReapTrackedChildren();
		process.exit(0);
	}
	const first = spawnAndRecord();
	first.once("exit", () => {
		// Exactly three microtask hops: this listener runs before the
		// reaper's resolve (it registered first), and the reaper's
		// `await Promise.all` adds two reaction layers before its empty-set
		// re-check — so hops 1-2 land BEFORE the re-check and get reaped even
		// by a single-pass reaper. Hop 3 is the vulnerable window: after the
		// re-check, before the worker's process.exit continuation.
		void Promise.resolve()
			.then(() => undefined)
			.then(() => undefined)
			.then(() => {
				spawnAndRecord();
			});
	});
});
