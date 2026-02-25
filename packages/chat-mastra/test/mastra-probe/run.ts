import os from "node:os";
import path from "node:path";
import { createMastraProbeService } from "./service";

const port = Number(process.env.PORT ?? "4590");
const routeBase = process.env.MASTRA_PROBE_BASE_PATH ?? "/chat-mastra/test";
const logFilePath =
	process.env.MASTRA_PROBE_LOG_FILE ??
	path.join(os.tmpdir(), "chat-mastra-probe", "events.ndjson");

const { app, closeAllSessions } = createMastraProbeService({
	logFilePath,
	basePath: routeBase,
	defaultCwd: process.cwd(),
});

const server = Bun.serve({
	port,
	fetch: app.fetch,
});

console.log(
	`[chat-mastra probe] listening on http://localhost:${server.port}${routeBase}`,
);
console.log(`[chat-mastra probe] log file: ${logFilePath}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		void closeAllSessions()
			.catch(() => {})
			.finally(() => {
				server.stop();
				process.exit(0);
			});
	});
}
