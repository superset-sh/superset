import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { DurableStreamTestServer } from "@durable-streams/server";
import { serve } from "@hono/node-server";
import { env } from "./env";
import { createServer } from "./server";

// Kill stale listeners left behind by dev server restarts
function freePort(port: number): void {
	try {
		const pid = execSync(`lsof -iTCP:${port} -sTCP:LISTEN -t`, {
			encoding: "utf-8",
		}).trim();
		if (pid) {
			process.kill(Number(pid), "SIGKILL");
			console.log(`[streams] Killed stale process ${pid} on port ${port}`);
		}
	} catch {
		// No process found on this port — nothing to do
	}
}

freePort(env.STREAMS_PORT);
freePort(env.STREAMS_INTERNAL_PORT);

if (!existsSync(env.STREAMS_DATA_DIR)) {
	mkdirSync(env.STREAMS_DATA_DIR, { recursive: true });
}

const durableStreamServer = new DurableStreamTestServer({
	port: env.STREAMS_INTERNAL_PORT,
	dataDir: env.STREAMS_DATA_DIR,
});
await durableStreamServer.start();
console.log(
	`[streams] Durable stream server on port ${env.STREAMS_INTERNAL_PORT}`,
);

const { app } = createServer({
	baseUrl: env.STREAMS_INTERNAL_URL,
	cors: true,
	logging: true,
});

const proxyServer = serve(
	{ fetch: app.fetch, port: env.STREAMS_PORT },
	(info) => {
		console.log(`[streams] Proxy running on http://localhost:${info.port}`);
	},
);

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, async () => {
		proxyServer.close();
		await durableStreamServer.stop();
		process.exit(0);
	});
}
