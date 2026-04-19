import * as fs from "node:fs";
import * as net from "node:net";
import { generateTokenFile, verifyToken } from "./auth";
import { handleFreshExec } from "./handlers/fresh-exec";
import { handleSpawnPtySubprocess } from "./handlers/spawn-pty-subprocess";
import { SpawnRequestSchema, type SpawnResponse } from "./types";

export interface SpawnServerOptions {
	socketPath: string;
	tokenPath: string;
	/**
	 * Idle timeout in milliseconds. Connections that send no data within this
	 * window are destroyed to prevent resource leaks from half-open clients.
	 * The timer is reset by any incoming data activity (Node stdlib behavior).
	 * Defaults to 5000ms.
	 */
	idleTimeoutMs?: number;
	/**
	 * Path to the pty-subprocess.js script (or a test echo script). This is a
	 * server-side config — NOT part of the RPC payload — so that authenticated
	 * clients cannot spawn arbitrary scripts through this server.
	 */
	subprocessScriptPath: string;
}

const DEFAULT_IDLE_TIMEOUT_MS = 5000;
const MAX_HANDSHAKE_LINE_BYTES = 1024 * 1024; // 1 MiB — same as spawn-session client cap

export interface SpawnServer {
	close(): Promise<void>;
}

/**
 * Start the fresh-spawn UDS server.
 *
 * Protocol: each client connection sends a single NDJSON request. One-shot
 * error paths (validation, schema, auth) write a single NDJSON response and
 * close the connection. The streaming handlers (`spawn-pty-subprocess` and
 * `fresh-exec`) take ownership of the socket: they write the initial
 * `{type:"ok",pid}` SpawnResponse line and then stream NDJSON StreamFrames
 * (stdout/stderr/exit server→client; stdin/resize/signal client→server) until
 * the child exits or the peer disconnects.
 *
 * `spawn-pty-subprocess` uses child_process.spawn (no real tty); `fresh-exec`
 * uses node-pty (pseudoterminal) so interactive commands like `gh auth login`
 * work. For `fresh-exec` the command/args/env/cwd come from the request.
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
	const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;

	const server = net.createServer((client) => {
		let buffer = "";
		let handled = false;

		// Destroy clients that connect but never send a complete request.
		// setTimeout fires when the socket is idle (no read activity) for the
		// given duration; Node automatically resets the timer on each data event.
		client.setTimeout(idleTimeoutMs);
		client.once("timeout", () => {
			client.destroy();
		});

		client.on("data", (chunk) => {
			if (handled) return;
			buffer += chunk.toString("utf8");
			if (buffer.length > MAX_HANDSHAKE_LINE_BYTES) {
				// Peer is streaming bytes without ever sending a newline. Cap
				// the accumulation to bound memory, matching the client-side
				// guard in spawn-session.ts.
				handled = true;
				writeResponse(client, {
					type: "error",
					message: `handshake exceeded ${MAX_HANDSHAKE_LINE_BYTES} bytes without newline`,
					code: "E_TOO_LARGE",
				});
				client.end();
				return;
			}
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

			// Bytes that arrived in the same TCP chunk after the request line
			// (e.g. pipelined stdin frames) — forward to the handler so they
			// are parsed as its first incoming frames.
			const residual = buffer.slice(newlineIdx + 1);

			if (result.data.type === "spawn-pty-subprocess") {
				// Handler takes ownership of the socket: it writes the initial
				// {type:"ok",pid} line and then streams NDJSON frames until the
				// child exits or the client disconnects. Do not write to or
				// close the socket here after a successful dispatch.
				try {
					handleSpawnPtySubprocess({ env: result.data.env }, client, {
						subprocessScriptPath: options.subprocessScriptPath,
						initialBuffer: residual,
					});
				} catch (err) {
					writeResponse(client, {
						type: "error",
						message: err instanceof Error ? err.message : String(err),
						code: "E_SPAWN",
					});
					client.end();
				}
				return;
			}

			if (result.data.type === "fresh-exec") {
				// Same ownership contract as spawn-pty-subprocess, but uses
				// node-pty so interactive commands get a real tty.
				try {
					handleFreshExec(
						{
							command: result.data.command,
							args: result.data.args,
							cwd: result.data.cwd,
							env: result.data.env,
							ptyCols: result.data.ptyCols,
							ptyRows: result.data.ptyRows,
						},
						client,
						{ initialBuffer: residual },
					);
				} catch (err) {
					writeResponse(client, {
						type: "error",
						message: err instanceof Error ? err.message : String(err),
						code: "E_FRESH_EXEC",
					});
					client.end();
				}
				return;
			}
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
			// Keep a permanent error listener so post-startup server errors
			// (e.g. EMFILE from a runaway connect loop, filesystem permission
			// changes on the socket path) don't propagate as unhandled and
			// kill the entire daemon.
			server.on("error", (err) => {
				console.error("[fresh-spawn] server error after startup:", err);
			});
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
