/**
 * Durable Streams Server with Session Registry
 *
 * Combines the official @durable-streams/server with a session registry API.
 * The durable streams server runs on an internal port, and this Hono server
 * proxies requests to it while handling /sessions routes directly.
 */

import {
	createServer as createHttpServer,
	request as httpRequest,
} from "node:http";
import { DurableStreamTestServer } from "@durable-streams/server";
import { SessionRegistry } from "./session-registry.js";

const dataDir = process.env.DATA_DIR || "./data";
const port = Number.parseInt(process.env.PORT || "8080", 10);
const internalPort = port + 1; // Durable streams runs on internal port

const registry = new SessionRegistry(dataDir);

// Start the durable streams server on internal port
const durableServer = new DurableStreamTestServer({
	port: internalPort,
	host: "127.0.0.1",
	dataDir,
});

// Create main HTTP server that routes requests
const server = createHttpServer(async (req, res) => {
	const url = new URL(req.url || "/", `http://${req.headers.host}`);

	// CORS headers
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader(
		"Access-Control-Allow-Methods",
		"GET, POST, PUT, DELETE, HEAD, OPTIONS",
	);
	res.setHeader(
		"Access-Control-Allow-Headers",
		"Content-Type, Producer-Id, Producer-Epoch, Producer-Seq, Authorization",
	);
	res.setHeader("Access-Control-Expose-Headers", "*");

	if (req.method === "OPTIONS") {
		res.writeHead(204);
		res.end();
		return;
	}

	// Handle session registry routes
	if (url.pathname === "/sessions" || url.pathname === "/sessions/") {
		if (req.method === "GET") {
			// List all sessions
			const sessions = registry.list();
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(sessions));
			return;
		}

		if (req.method === "POST") {
			// Register a new session
			try {
				const body = await readBody(req);
				const { sessionId, title, createdBy } = JSON.parse(body);

				if (!sessionId || !title) {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(
						JSON.stringify({ error: "sessionId and title are required" }),
					);
					return;
				}

				const session = registry.register({ sessionId, title, createdBy });
				res.writeHead(201, { "Content-Type": "application/json" });
				res.end(JSON.stringify(session));
				return;
			} catch (error) {
				console.error("[sessions] Failed to parse request body:", error);
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Invalid JSON body" }));
				return;
			}
		}

		res.writeHead(405, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Method not allowed" }));
		return;
	}

	// Handle GET /sessions/:id
	const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)$/);
	if (sessionMatch?.[1]) {
		const sessionId = sessionMatch[1];

		if (req.method === "GET") {
			const session = registry.get(sessionId);
			if (!session) {
				res.writeHead(404, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Session not found" }));
				return;
			}
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(session));
			return;
		}

		res.writeHead(405, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Method not allowed" }));
		return;
	}

	// Health check
	if (url.pathname === "/health") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ status: "ok" }));
		return;
	}

	// Proxy all other requests to durable streams server
	proxyToDurableStreams(req, res, url);
});

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk) => chunks.push(chunk));
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
		req.on("error", reject);
	});
}

function proxyToDurableStreams(
	req: import("node:http").IncomingMessage,
	res: import("node:http").ServerResponse,
	url: URL,
) {
	const proxyReq = httpRequest(
		{
			hostname: "127.0.0.1",
			port: internalPort,
			path: url.pathname + url.search,
			method: req.method,
			headers: req.headers,
		},
		(proxyRes) => {
			// Forward status and headers
			res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
			proxyRes.pipe(res);
		},
	);

	proxyReq.on("error", (err: Error) => {
		console.error("[proxy] Error proxying to durable streams:", err);
		if (!res.headersSent) {
			res.writeHead(502, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Bad gateway" }));
		}
	});

	// Pipe request body for POST/PUT requests
	req.pipe(proxyReq);
}

console.log(`[streams] Starting on port ${port}`);

// Start both servers
durableServer.start().then((durableUrl) => {
	console.log(`[streams] Durable streams internal: ${durableUrl}`);

	server.listen(port, "0.0.0.0", () => {
		console.log(`[streams] Server running at http://0.0.0.0:${port}`);
	});
});

export default server;
