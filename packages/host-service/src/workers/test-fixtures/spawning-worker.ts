// Test fixture: a worker whose tasks spawn a long-lived child and then never
// respond, forcing the runner's timeout/abort termination path while a child
// is in flight. The child's PID is appended to SPAWN_PID_FILE so tests can
// assert it was killed AND reaped. Honors cooperative shutdown like the real
// host-worker entry.
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { parentPort } from "node:worker_threads";
import { killAndReapTrackedChildren } from "../worker-child-tracker.ts";
import { isWorkerShutdownRequestMessage } from "../worker-task-protocol.ts";

parentPort?.on("message", async (message: unknown) => {
	if (isWorkerShutdownRequestMessage(message)) {
		await killAndReapTrackedChildren();
		process.exit(0);
	}
	const child = spawn("sleep", ["30"], { stdio: "ignore" });
	if (process.env.SPAWN_PID_FILE) {
		appendFileSync(process.env.SPAWN_PID_FILE, `${child.pid}\n`);
	}
});
