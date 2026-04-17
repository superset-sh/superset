import { EventEmitter } from "node:events";
import * as net from "node:net";
import { Readable, Writable } from "node:stream";
import { readTokenFile } from "./auth";
import {
	type ClientToServerStreamFrame,
	ServerToClientStreamFrameSchema,
	SpawnResponseSchema,
} from "./types";

export interface OpenSpawnSessionOptions {
	socketPath: string;
	tokenPath: string;
	env: Record<string, string>;
	/** Connection establishment + handshake timeout. Default 5000ms. */
	handshakeTimeoutMs?: number;
}

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5000;

/**
 * Drop-in replacement for node:child_process ChildProcess that actually wraps
 * a UDS-backed stream to the fresh-spawn server. Consumers of terminal-host
 * session.ts can treat this like a spawned child.
 */
export interface SpawnSession extends EventEmitter {
	readonly pid: number;
	readonly stdin: Writable;
	readonly stdout: Readable;
	readonly stderr: Readable;
	kill(signal?: NodeJS.Signals | string): boolean;
	/**
	 * Resize hint forwarded to server — no-op for non-PTY spawn but supported
	 * by fresh-exec.
	 */
	resize(cols: number, rows: number): void;
}

/**
 * Opens a streaming spawn session against the fresh-spawn server.
 *
 * Resolves once the server has responded with `{type:"ok",pid}` and the
 * session is ready to stream I/O. Rejects on handshake errors (timeout,
 * schema mismatch, E_* error response).
 *
 * After resolution, the underlying UDS connection stays open for
 * bidirectional NDJSON streaming:
 *   - stdin writes are encoded as `stdin` frames.
 *   - stdout/stderr frames from the server push into the session's Readable
 *     streams.
 *   - `kill` writes a `signal` frame; `resize` writes a `resize` frame.
 *   - The `exit` event fires on the first `exit` frame from the server.
 */
export async function openSpawnSession(
	options: OpenSpawnSessionOptions,
): Promise<SpawnSession> {
	const token = readTokenFile(options.tokenPath);
	const handshakeTimeoutMs =
		options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;

	return new Promise<SpawnSession>((resolve, reject) => {
		const client = net.createConnection(options.socketPath);
		let handshakeDone = false;
		let buffer = "";

		const timer = setTimeout(() => {
			if (!handshakeDone) {
				try {
					client.destroy();
				} catch {
					// ignore
				}
				reject(new Error(`handshake timeout after ${handshakeTimeoutMs}ms`));
			}
		}, handshakeTimeoutMs);

		client.once("error", (err) => {
			if (!handshakeDone) {
				clearTimeout(timer);
				reject(err);
			}
		});

		client.once("connect", () => {
			const req = {
				type: "spawn-pty-subprocess" as const,
				token,
				env: options.env,
			};
			client.write(`${JSON.stringify(req)}\n`);
		});

		// Stage 1: wait for initial SpawnResponse line.
		const onHandshakeData = (chunk: Buffer): void => {
			buffer += chunk.toString("utf8");
			const newlineIdx = buffer.indexOf("\n");
			if (newlineIdx === -1) return;

			const line = buffer.slice(0, newlineIdx);
			const remainder = buffer.slice(newlineIdx + 1);
			buffer = "";

			let parsed: unknown;
			try {
				parsed = JSON.parse(line);
			} catch (err) {
				clearTimeout(timer);
				client.destroy();
				reject(
					new Error(
						`invalid handshake response JSON: ${
							err instanceof Error ? err.message : String(err)
						}`,
					),
				);
				return;
			}

			const parseResult = SpawnResponseSchema.safeParse(parsed);
			if (!parseResult.success) {
				clearTimeout(timer);
				client.destroy();
				reject(new Error(`invalid SpawnResponse schema: ${line}`));
				return;
			}

			const resp = parseResult.data;
			if (resp.type === "error") {
				clearTimeout(timer);
				client.destroy();
				reject(new Error(`spawn error (${resp.code}): ${resp.message}`));
				return;
			}

			// Success — transition to streaming phase.
			clearTimeout(timer);
			handshakeDone = true;
			client.off("data", onHandshakeData);
			const session = createSession(client, resp.pid, remainder);
			resolve(session);
		};
		client.on("data", onHandshakeData);
	});
}

function createSession(
	client: net.Socket,
	pid: number,
	initialBuffer: string,
): SpawnSession {
	const emitter = new EventEmitter() as SpawnSession;
	Object.defineProperty(emitter, "pid", { value: pid, writable: false });

	// Readable streams for stdout and stderr — data is pushed manually as
	// frames arrive from the server.
	const stdout = new Readable({
		read() {
			// passive; we push manually
		},
	});
	const stderr = new Readable({
		read() {
			// passive; we push manually
		},
	});

	// Writable stream for stdin — forwards to UDS as {type:"stdin"} frames.
	const stdin = new Writable({
		write(chunk: Buffer | string, _encoding, callback) {
			const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
			writeClientFrame(client, {
				type: "stdin",
				data: buf.toString("base64"),
			});
			callback();
		},
		final(callback) {
			// End of stdin: just stop writing. UDS stream stays open for
			// further frames (signal, resize, incoming stdout).
			callback();
		},
	});

	Object.defineProperty(emitter, "stdin", { value: stdin, writable: false });
	Object.defineProperty(emitter, "stdout", { value: stdout, writable: false });
	Object.defineProperty(emitter, "stderr", { value: stderr, writable: false });

	emitter.kill = (signal: NodeJS.Signals | string = "SIGTERM"): boolean => {
		writeClientFrame(client, {
			type: "signal",
			name: String(signal),
		});
		return true;
	};

	emitter.resize = (cols: number, rows: number): void => {
		writeClientFrame(client, {
			type: "resize",
			cols,
			rows,
		});
	};

	// Stream parser.
	let buffer = initialBuffer;
	const processBuffer = (): void => {
		let newlineIdx: number;
		// biome-ignore lint/suspicious/noAssignInExpressions: standard NDJSON line extractor
		while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
			const line = buffer.slice(0, newlineIdx);
			buffer = buffer.slice(newlineIdx + 1);
			if (line.trim().length === 0) continue;
			handleStreamLine(line, stdout, stderr, emitter);
		}
	};

	// Process any pipelined bytes that arrived in the same TCP chunk as the
	// handshake response.
	processBuffer();

	client.on("data", (chunk: Buffer) => {
		buffer += chunk.toString("utf8");
		processBuffer();
	});

	client.once("close", () => {
		stdout.push(null);
		stderr.push(null);
	});

	client.on("error", (err) => {
		emitter.emit("error", err);
	});

	return emitter;
}

function handleStreamLine(
	line: string,
	stdout: Readable,
	stderr: Readable,
	emitter: SpawnSession,
): void {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return;
	}
	const result = ServerToClientStreamFrameSchema.safeParse(parsed);
	if (!result.success) return;

	const frame = result.data;
	switch (frame.type) {
		case "stdout":
			stdout.push(Buffer.from(frame.data, "base64"));
			return;
		case "stderr":
			stderr.push(Buffer.from(frame.data, "base64"));
			return;
		case "exit":
			emitter.emit("exit", frame.code, frame.signal);
			return;
	}
}

function writeClientFrame(
	client: net.Socket,
	frame: ClientToServerStreamFrame,
): void {
	try {
		client.write(`${JSON.stringify(frame)}\n`);
	} catch {
		// socket may be destroyed during teardown
	}
}
