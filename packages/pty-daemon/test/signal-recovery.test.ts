// Real-signal recovery tests: spawn the bundled daemon as a child process,
// then SIGKILL it (no graceful close events) and verify the client surfaces
// the disconnect cleanly. Different from the existing control-plane tests,
// which use Server.close() — that's the cooperative shutdown path. Real
// production crashes don't go through Server.close.
//
// Runs under Node (`node --experimental-strip-types --test`).

import { strict as assert } from "node:assert";
import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	CURRENT_PROTOCOL_VERSION,
	encodeFrame,
	FrameDecoder,
	type ServerMessage,
} from "../src/protocol/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAEMON_BUNDLE = path.resolve(__dirname, "../dist/pty-daemon.js");
const SOCK = path.join(os.tmpdir(), `pty-daemon-sigkill-${process.pid}.sock`);

let daemonProcess: childProcess.ChildProcess | null = null;

before(async () => {
	if (!fs.existsSync(DAEMON_BUNDLE)) {
		throw new Error(
			`Missing daemon bundle at ${DAEMON_BUNDLE}. Run \`bun run build:daemon\` first.`,
		);
	}

	daemonProcess = childProcess.spawn(
		process.execPath,
		[DAEMON_BUNDLE, `--socket=${SOCK}`],
		{
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, NODE_ENV: "test" },
		},
	);
	daemonProcess.stderr?.on("data", (chunk) => {
		process.stderr.write(`[daemon-stderr] ${chunk}`);
	});

	// Wait for socket to become connectable.
	const deadline = Date.now() + 5000;
	while (Date.now() < deadline) {
		if (fs.existsSync(SOCK)) {
			const ok = await new Promise<boolean>((resolve) => {
				const s = net.createConnection({ path: SOCK });
				const t = setTimeout(() => {
					s.destroy();
					resolve(false);
				}, 200);
				s.once("connect", () => {
					clearTimeout(t);
					s.end();
					resolve(true);
				});
				s.once("error", () => {
					clearTimeout(t);
					resolve(false);
				});
			});
			if (ok) break;
		}
		await new Promise((r) => setTimeout(r, 50));
	}
});

after(async () => {
	if (daemonProcess && !daemonProcess.killed) {
		daemonProcess.kill("SIGKILL");
		await new Promise((r) => daemonProcess?.once("exit", r));
	}
	try {
		fs.unlinkSync(SOCK);
	} catch {
		// best-effort
	}
});

describe("daemon SIGKILL recovery", () => {
	test("clients receive close events when daemon dies via SIGKILL", async () => {
		// Open a connection, complete handshake, send a list to confirm health.
		const client = await connect();
		client.send({ type: "hello", protocols: [CURRENT_PROTOCOL_VERSION] });
		await client.waitFor((m) => m.type === "hello-ack", 2000);

		// Capture disconnect.
		const disconnected = new Promise<void>((resolve) =>
			client.socket.once("close", () => resolve()),
		);

		// Now SIGKILL the daemon. No graceful Server.close, no exit broadcast.
		assert.ok(daemonProcess);
		daemonProcess.kill("SIGKILL");
		await new Promise((r) => daemonProcess?.once("exit", r));

		// Client should see the socket close within reasonable time.
		await Promise.race([
			disconnected,
			new Promise((_, rej) =>
				setTimeout(() => rej(new Error("disconnect not surfaced")), 2000),
			),
		]);

		// Subsequent send fails synchronously (writable: false) or async.
		// Either way, no hang.
		try {
			client.send({ type: "list" });
		} catch {
			// Either path is acceptable — just don't hang.
		}

		// Process is gone; ensure cleanup so `after` doesn't block.
		daemonProcess = null;
		try {
			fs.unlinkSync(SOCK);
		} catch {
			// best-effort — daemon's atexit didn't run because of SIGKILL
		}
	});
});

// ---------------- helpers ----------------

interface Client {
	socket: net.Socket;
	messages: ServerMessage[];
	send(m: unknown): void;
	waitFor(
		predicate: (m: ServerMessage) => boolean,
		ms: number,
	): Promise<ServerMessage>;
}

function connect(): Promise<Client> {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection({ path: SOCK });
		const decoder = new FrameDecoder();
		const messages: ServerMessage[] = [];

		socket.on("data", (chunk) => {
			decoder.push(chunk);
			for (const raw of decoder.drain()) {
				messages.push(raw as ServerMessage);
			}
		});

		socket.once("error", reject);
		socket.once("connect", () => {
			resolve({
				socket,
				messages,
				send(m) {
					if (!socket.destroyed) socket.write(encodeFrame(m));
				},
				waitFor(predicate, ms) {
					return new Promise<ServerMessage>((res, rej) => {
						const found = messages.find(predicate);
						if (found) return res(found);
						const onData = () => {
							const m = messages.find(predicate);
							if (m) {
								socket.off("data", onData);
								clearTimeout(t);
								res(m);
							}
						};
						const t = setTimeout(() => {
							socket.off("data", onData);
							rej(new Error("waitFor timed out"));
						}, ms);
						socket.on("data", onData);
					});
				},
			});
		});
	});
}
