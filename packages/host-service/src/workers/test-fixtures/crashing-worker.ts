// Test fixture: a worker that dies on its first task, for exercising the
// pool's inline-retry and crash-circuit paths. CRASH_MARKER_FILE lets tests
// count how many crashing workers were ever spawned.
import { appendFileSync } from "node:fs";
import { parentPort } from "node:worker_threads";

if (process.env.CRASH_MARKER_FILE) {
	appendFileSync(process.env.CRASH_MARKER_FILE, "x");
}

parentPort?.on("message", () => {
	process.exit(1);
});
