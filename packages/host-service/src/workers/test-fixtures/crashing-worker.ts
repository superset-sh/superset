// Test fixture: a worker that dies on its first task, for exercising the
// pool's inline-retry and crash-circuit paths.
import { parentPort } from "node:worker_threads";

parentPort?.on("message", () => {
	process.exit(1);
});
