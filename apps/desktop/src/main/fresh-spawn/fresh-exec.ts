/**
 * fresh-exec — invoked by zsh/bash shell wrapper in stale terminals to
 * proxy commands through the fresh-spawn server running in Electron main.
 *
 * Usage:
 *   fresh-exec <command> [args...]
 *
 * Connects to ~/.superset/fresh-spawn.sock, sends a fresh-exec request,
 * and bridges local stdin/stdout/stderr <-> the server's PTY stream.
 *
 * If the fresh-spawn server is unreachable, falls back to executing the
 * command directly in the current stale context. In that degraded mode
 * interactive TLS-requiring tools (gh, terraform) will fail the same
 * way they would without fresh-exec; the wrapper is inert.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import { readTokenFile } from "./auth";
import {
	type ClientToServerStreamFrame,
	DEFAULT_SOCKET_PATH,
	DEFAULT_TOKEN_PATH,
	ServerToClientStreamFrameSchema,
	SpawnResponseSchema,
} from "./types";

export interface ParsedArgv {
	command: string;
	args: string[];
}

const HANDSHAKE_TIMEOUT_MS = 5000;

/**
 * Parse argv for the fresh-exec binary.
 *
 * Handles two invocation shapes:
 *   1. Shell-wrapper style: argv = ["fresh-exec", "gh", "auth", "login"]
 *   2. node-direct style:  argv = ["/usr/bin/node", "/path/fresh-exec.js", ...]
 *
 * Strategy: find the first argv element whose basename looks like
 * `fresh-exec` (with or without a `.js`/`.ts` extension); the command
 * begins at the next index. If no such element is found we fall back to
 * treating argv[1..] as the command+args (handles repackaged binaries).
 */
export function parseFreshExecArgv(argv: string[]): ParsedArgv {
	const freshExecIdx = argv.findIndex((a) => {
		const base = a.split("/").pop() ?? a;
		return (
			base === "fresh-exec" ||
			base === "fresh-exec.js" ||
			base === "fresh-exec.ts"
		);
	});
	const startIdx = freshExecIdx === -1 ? 1 : freshExecIdx + 1;
	if (startIdx >= argv.length) {
		throw new Error("fresh-exec: missing command argument");
	}
	const command = argv[startIdx];
	if (command === undefined || command.length === 0) {
		throw new Error("fresh-exec: missing command argument");
	}
	return {
		command,
		args: argv.slice(startIdx + 1),
	};
}

interface BridgeExitInfo {
	code: number | null;
	signal: string | null;
}

function getPtyDimensions(): { cols: number; rows: number } {
	const cols = process.stdout.columns ?? 80;
	const rows = process.stdout.rows ?? 24;
	return { cols, rows };
}

async function connectAndHandshake(
	socketPath: string,
	tokenPath: string,
	command: string,
	args: string[],
): Promise<{ client: net.Socket; pendingBytes: string }> {
	const token = readTokenFile(tokenPath);
	const { cols, rows } = getPtyDimensions();

	return new Promise<{ client: net.Socket; pendingBytes: string }>(
		(resolve, reject) => {
			const client = net.createConnection(socketPath);
			let buffer = "";
			let settled = false;

			const timer = setTimeout(() => {
				settleReject(new Error("fresh-exec handshake timeout"));
			}, HANDSHAKE_TIMEOUT_MS);

			function settleResolve(payload: {
				client: net.Socket;
				pendingBytes: string;
			}): void {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve(payload);
			}

			function settleReject(err: Error): void {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				try {
					client.destroy();
				} catch {
					// ignore
				}
				reject(err);
			}

			client.once("error", (err) => {
				settleReject(err);
			});

			client.once("connect", () => {
				const req = {
					type: "fresh-exec" as const,
					token,
					command,
					args,
					cwd: process.cwd(),
					env: process.env as Record<string, string>,
					ptyCols: cols,
					ptyRows: rows,
				};
				client.write(`${JSON.stringify(req)}\n`);
			});

			const onHandshakeData = (chunk: Buffer): void => {
				buffer += chunk.toString("utf8");
				const newlineIdx = buffer.indexOf("\n");
				if (newlineIdx === -1) return;

				const line = buffer.slice(0, newlineIdx);
				const remainder = buffer.slice(newlineIdx + 1);

				let parsed: unknown;
				try {
					parsed = JSON.parse(line);
				} catch (err) {
					settleReject(
						new Error(
							`fresh-exec invalid handshake JSON: ${err instanceof Error ? err.message : String(err)}`,
						),
					);
					return;
				}

				const parseResult = SpawnResponseSchema.safeParse(parsed);
				if (!parseResult.success) {
					settleReject(new Error(`fresh-exec invalid SpawnResponse: ${line}`));
					return;
				}

				const resp = parseResult.data;
				if (resp.type === "error") {
					settleReject(
						new Error(
							`fresh-exec server error (${resp.code}): ${resp.message}`,
						),
					);
					return;
				}

				client.off("data", onHandshakeData);
				settleResolve({ client, pendingBytes: remainder });
			};
			client.on("data", onHandshakeData);
		},
	);
}

function bridgeSocketToStdio(
	client: net.Socket,
	pendingBytes: string,
): Promise<BridgeExitInfo> {
	return new Promise<BridgeExitInfo>((resolve, reject) => {
		// Set raw mode on stdin so keystrokes (including Ctrl+C) go through as-is.
		const wasRaw = process.stdin.isTTY ? process.stdin.isRaw : false;
		if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
			process.stdin.setRawMode(true);
		}
		process.stdin.resume();

		const cleanup = (): void => {
			if (
				process.stdin.isTTY &&
				typeof process.stdin.setRawMode === "function"
			) {
				process.stdin.setRawMode(wasRaw);
			}
			process.stdin.pause();
			process.stdin.removeListener("data", onStdin);
			process.removeListener("SIGWINCH", onWinch);
		};

		const writeFrame = (frame: ClientToServerStreamFrame): void => {
			try {
				client.write(`${JSON.stringify(frame)}\n`);
			} catch {
				// server may have closed
			}
		};

		const onStdin = (chunk: Buffer): void => {
			writeFrame({
				type: "stdin",
				data: chunk.toString("base64"),
			});
		};

		const onWinch = (): void => {
			const { cols, rows } = getPtyDimensions();
			writeFrame({ type: "resize", cols, rows });
		};

		process.stdin.on("data", onStdin);
		process.on("SIGWINCH", onWinch);

		let lastExit: BridgeExitInfo = { code: null, signal: null };
		let buffer = pendingBytes;

		const processBuffer = (): void => {
			let idx = buffer.indexOf("\n");
			while (idx !== -1) {
				const line = buffer.slice(0, idx);
				buffer = buffer.slice(idx + 1);
				if (line.trim().length > 0) {
					handleFrameLine(line);
				}
				idx = buffer.indexOf("\n");
			}
		};

		const handleFrameLine = (line: string): void => {
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
					process.stdout.write(Buffer.from(frame.data, "base64"));
					return;
				case "stderr":
					process.stderr.write(Buffer.from(frame.data, "base64"));
					return;
				case "exit":
					lastExit = {
						code: frame.code,
						signal: frame.signal,
					};
					return;
			}
		};

		// Drain any bytes that arrived pipelined with the handshake response.
		processBuffer();

		client.on("data", (chunk: Buffer) => {
			buffer += chunk.toString("utf8");
			processBuffer();
		});

		client.once("close", () => {
			cleanup();
			resolve(lastExit);
		});
		client.once("error", (err) => {
			cleanup();
			reject(err);
		});
	});
}

/**
 * Fallback: if fresh-spawn server unreachable, exec the command directly.
 * The command runs in the stale context; for non-TLS commands this is fine.
 * For TLS-requiring tools, the user gets the same error they would without
 * fresh-exec wrapping them (no worse than baseline).
 */
function fallbackDirectExec(command: string, args: string[]): Promise<number> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: "inherit",
			env: process.env,
			cwd: process.cwd(),
		});
		child.on("exit", (code, signal) => {
			if (signal !== null) {
				// bash semantics: 128 + signal number. Node gives signal as a name
				// string; we don't have a portable signal->number mapping here, so
				// use 128 + 15 (SIGTERM) as the generic fallback.
				resolve(128 + 15);
				return;
			}
			resolve(code ?? 0);
		});
		child.on("error", reject);
	});
}

export async function main(argv: string[] = process.argv): Promise<number> {
	let parsed: ParsedArgv;
	try {
		parsed = parseFreshExecArgv(argv);
	} catch (err) {
		process.stderr.write(
			`${err instanceof Error ? err.message : String(err)}\n`,
		);
		return 2;
	}

	const socketPath = DEFAULT_SOCKET_PATH;
	const tokenPath = DEFAULT_TOKEN_PATH;
	const serverReachable =
		process.platform === "darwin" &&
		fs.existsSync(socketPath) &&
		fs.existsSync(tokenPath);

	if (!serverReachable) {
		return fallbackDirectExec(parsed.command, parsed.args);
	}

	let handshake: { client: net.Socket; pendingBytes: string };
	try {
		handshake = await connectAndHandshake(
			socketPath,
			tokenPath,
			parsed.command,
			parsed.args,
		);
	} catch (err) {
		process.stderr.write(
			`[fresh-exec] fell back to direct exec (${err instanceof Error ? err.message : String(err)})\n`,
		);
		return fallbackDirectExec(parsed.command, parsed.args);
	}

	try {
		const exit = await bridgeSocketToStdio(
			handshake.client,
			handshake.pendingBytes,
		);
		if (exit.signal !== null) {
			const signum = Number.parseInt(exit.signal, 10);
			if (Number.isFinite(signum) && signum > 0) {
				return 128 + signum;
			}
			return 128 + 15; // SIGTERM default
		}
		return exit.code ?? 0;
	} catch (err) {
		process.stderr.write(
			`[fresh-exec] bridge error: ${err instanceof Error ? err.message : String(err)}\n`,
		);
		return 1;
	}
}

// Entry point — only runs if invoked directly (not imported for tests).
if (require.main === module) {
	main()
		.then((code) => {
			process.exit(code);
		})
		.catch((err: unknown) => {
			const msg = err instanceof Error ? err.message : String(err);
			process.stderr.write(`fresh-exec unexpected: ${msg}\n`);
			process.exit(1);
		});
}
