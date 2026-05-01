import * as net from "node:net";
import { readTokenFile } from "./auth";
import { type SpawnResponse, SpawnResponseSchema } from "./types";

export interface SendSpawnRequestOptions {
	socketPath: string;
	tokenPath: string;
	request:
		| {
				type: "spawn-pty-subprocess";
				env: Record<string, string>;
		  }
		| {
				type: "fresh-exec";
				command: string;
				args: string[];
				cwd: string;
				env: Record<string, string>;
				ptyCols: number;
				ptyRows: number;
		  };
	timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Send a single spawn request to the fresh-spawn server.
 *
 * Reads the auth token from disk, connects via UDS, writes one NDJSON line,
 * waits for the first newline-terminated response line, validates the schema,
 * and returns the parsed response.
 *
 * Rejects if:
 * - Token file cannot be read (e.g. ENOENT)
 * - Socket cannot be connected (e.g. ENOENT, ECONNREFUSED)
 * - No response arrives within `timeoutMs` (default 5000)
 * - Response is not valid JSON or fails schema validation
 *
 * This function owns exactly one connection per call; the underlying socket is
 * always destroyed before the returned promise settles.
 */
export async function sendSpawnRequest(
	options: SendSpawnRequestOptions,
): Promise<SpawnResponse> {
	// Read the token synchronously so token-file errors (ENOENT, EACCES) reject
	// the promise before we open any socket.
	const token = readTokenFile(options.tokenPath);
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	return new Promise<SpawnResponse>((resolve, reject) => {
		const client = net.createConnection(options.socketPath);
		let buffer = "";
		let settled = false;

		const settle = (fn: () => void): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			try {
				client.destroy();
			} catch {
				// already destroyed — ignore
			}
			fn();
		};

		const timer = setTimeout(() => {
			settle(() =>
				reject(new Error(`spawn request timeout after ${timeoutMs}ms`)),
			);
		}, timeoutMs);

		client.once("error", (err) => {
			settle(() => reject(err));
		});

		client.once("connect", () => {
			const req = { ...options.request, token };
			client.write(`${JSON.stringify(req)}\n`);
		});

		client.on("data", (chunk) => {
			buffer += chunk.toString("utf8");
			const newlineIdx = buffer.indexOf("\n");
			if (newlineIdx === -1) return;

			const line = buffer.slice(0, newlineIdx);
			let parsed: unknown;
			try {
				parsed = JSON.parse(line);
			} catch (err) {
				settle(() => reject(err));
				return;
			}
			const result = SpawnResponseSchema.safeParse(parsed);
			if (!result.success) {
				settle(() => reject(new Error(`invalid response schema: ${line}`)));
				return;
			}
			settle(() => resolve(result.data));
		});
	});
}
