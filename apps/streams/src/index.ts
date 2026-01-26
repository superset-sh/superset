/**
 * Durable Streams Server
 *
 * Uses the official @durable-streams/server package for 100% protocol compliance.
 */

import { DurableStreamTestServer } from "@durable-streams/server";

const dataDir = process.env.DATA_DIR || "./data";
const port = Number.parseInt(process.env.PORT || "8080", 10);

const server = new DurableStreamTestServer({
	port,
	host: "0.0.0.0",
	dataDir,
});

console.log(`[streams] Starting on port ${port}`);

server.start().then((url) => {
	console.log(`[streams] Server running at ${url}`);
});

export default server;
