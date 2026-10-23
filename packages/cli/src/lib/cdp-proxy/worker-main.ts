import { runCdpProxyWorker } from "./worker";

const controller = new AbortController();
const stop = () => controller.abort();
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
try {
	await runCdpProxyWorker(controller.signal, process.argv[3] ?? "");
} catch {
	process.exitCode = 1;
}
