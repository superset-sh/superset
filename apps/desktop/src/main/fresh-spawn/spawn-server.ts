import * as fs from "node:fs";
import * as net from "node:net";
import { generateTokenFile, verifyToken } from "./auth";
import { SpawnRequestSchema, type SpawnResponse } from "./types";

export interface SpawnServerOptions {
	socketPath: string;
	tokenPath: string;
}

export interface SpawnServer {
	close(): Promise<void>;
}

/**
 * Start the fresh-spawn UDS server.
 *
 * Protocol: each client connection sends a single NDJSON request and receives
 * a single NDJSON response, then the server closes the connection. Partial
 * chunks are buffered until the first newline is seen; any trailing bytes are
 * ignored (one request per connection).
 *
 * Spawn handlers (`spawn-pty-subprocess`, `fresh-exec`) are not yet wired in
 * and return `{type:"error", code:"E_TODO"}`. Tasks 8 and 13 will fill them.
 */
export async function startSpawnServer(
	options: SpawnServerOptions,
): Promise<SpawnServer> {
	// Remove stale socket if a previous process crashed without cleanup.
	// ENOENT is fine and any other error will surface from listen() below.
	try {
		fs.unlinkSync(options.socketPath);
	} catch {
		// ignore
	}

	const token = generateTokenFile(options.tokenPath);

	const server = net.createServer((client) => {
		let buffer = "";
		let handled = false;

		client.on("data", (chunk) => {
			if (handled) return;
			buffer += chunk.toString("utf8");
			const newlineIdx = buffer.indexOf("\n");
			if (newlineIdx === -1) return;

			handled = true;
			const line = buffer.slice(0, newlineIdx);

			let parsed: unknown;
			try {
				parsed = JSON.parse(line);
			} catch {
				writeResponse(client, {
					type: "error",
					message: "invalid JSON",
					code: "E_PARSE",
				});
				client.end();
				return;
			}

			const result = SpawnRequestSchema.safeParse(parsed);
			if (!result.success) {
				writeResponse(client, {
					type: "error",
					message: "invalid request schema",
					code: "E_SCHEMA",
				});
				client.end();
				return;
			}

			if (!verifyToken(result.data.token, token)) {
				writeResponse(client, {
					type: "error",
					message: "bad token",
					code: "E_AUTH",
				});
				client.end();
				return;
			}

			// TODO(Task 8): wire `spawn-pty-subprocess` handler
			// TODO(Task 13): wire `fresh-exec` handler
			writeResponse(client, {
				type: "error",
				message: `handler not implemented for type: ${result.data.type}`,
				code: "E_TODO",
			});
			client.end();
		});

		client.on("error", () => {
			// Swallow client socket errors; they happen on abrupt peer close.
		});
	});

	await new Promise<void>((resolve, reject) => {
		const onError = (err: Error) => {
			server.off("listening", onListening);
			reject(err);
		};
		const onListening = () => {
			server.off("error", onError);
			// Defense-in-depth: macOS may not enforce mode bits on AF_UNIX
			// sockets, but set 0o700 anyway so any filesystem that does honor
			// them keeps the socket owner-only.
			try {
				fs.chmodSync(options.socketPath, 0o700);
			} catch (err) {
				server.close();
				reject(err);
				return;
			}
			resolve();
		};
		server.once("error", onError);
		server.once("listening", onListening);
		server.listen(options.socketPath);
	});

	return {
		close: () =>
			new Promise<void>((resolve) => {
				server.close(() => {
					// Node does not auto-unlink Unix domain socket files.
					try {
						fs.unlinkSync(options.socketPath);
					} catch {
						// already gone
					}
					resolve();
				});
			}),
	};
}

function writeResponse(client: net.Socket, resp: SpawnResponse): void {
	client.write(`${JSON.stringify(resp)}\n`);
}
