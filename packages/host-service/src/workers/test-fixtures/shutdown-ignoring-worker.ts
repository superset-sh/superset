// Test fixture: a worker that stays alive but never honors shutdown
// requests, for exercising the grace-period hard-terminate fallback.
import { parentPort } from "node:worker_threads";

parentPort?.on("message", () => {});
