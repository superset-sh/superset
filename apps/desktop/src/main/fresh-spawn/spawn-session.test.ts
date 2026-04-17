import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { type SpawnServer, startSpawnServer } from "./spawn-server";
import { openSpawnSession } from "./spawn-session";

describe("openSpawnSession", () => {
	let server: SpawnServer | null = null;
	let tmpDir = "";

	afterEach(async () => {
		if (server) {
			await server.close();
			server = null;
		}
		if (tmpDir && fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
		tmpDir = "";
	});

	function setupEcho(): {
		socketPath: string;
		tokenPath: string;
		subprocessScriptPath: string;
	} {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-session-"));
		const echoPath = path.join(tmpDir, "echo.js");
		fs.writeFileSync(
			echoPath,
			`process.stdin.on("data", (d) => process.stdout.write(d));
process.stdin.on("end", () => process.exit(0));
`,
		);
		return {
			socketPath: path.join(tmpDir, "s.sock"),
			tokenPath: path.join(tmpDir, "s.token"),
			subprocessScriptPath: echoPath,
		};
	}

	it("establishes session and streams stdin→stdout round-trip", async () => {
		const paths = setupEcho();
		server = await startSpawnServer(paths);
		const session = await openSpawnSession({
			socketPath: paths.socketPath,
			tokenPath: paths.tokenPath,
			env: {},
		});

		expect(session.pid).toBeGreaterThan(0);

		const received: Buffer[] = [];
		session.stdout.on("data", (chunk: Buffer) => received.push(chunk));

		session.stdin.write("hello\n");

		// Wait for echo
		await new Promise<void>((r) => setTimeout(r, 200));

		const got = Buffer.concat(received).toString("utf8");
		expect(got).toBe("hello\n");

		// Cleanly kill
		const exitPromise = new Promise<{
			code: number | null;
			signal: string | null;
		}>((resolve) => {
			session.once("exit", (code: number | null, signal: string | null) =>
				resolve({ code, signal }),
			);
		});
		session.kill("SIGTERM");
		const exit = await exitPromise;
		expect(exit.signal).toBe("SIGTERM");
	}, 10000);

	it("rejects with E_AUTH on bad token", async () => {
		const paths = setupEcho();
		server = await startSpawnServer(paths);
		// Overwrite token file with a wrong token so the server returns E_AUTH.
		fs.writeFileSync(paths.tokenPath, "WRONG_TOKEN");

		await expect(
			openSpawnSession({
				socketPath: paths.socketPath,
				tokenPath: paths.tokenPath,
				env: {},
			}),
		).rejects.toThrow(/E_AUTH|bad token/);
	}, 10000);

	it("rejects when server is not listening", async () => {
		const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "fs-nosvr-"));
		const socketPath = path.join(tmpDir2, "missing.sock");
		const tokenPath = path.join(tmpDir2, "token");
		fs.writeFileSync(tokenPath, "doesnt-matter");

		await expect(
			openSpawnSession({ socketPath, tokenPath, env: {} }),
		).rejects.toThrow();

		fs.rmSync(tmpDir2, { recursive: true, force: true });
	});

	/**
	 * Start a bare-bones UDS server that accepts exactly one connection,
	 * performs the handshake (writes {type:"ok",pid}), and then lets the caller
	 * decide when/how to disconnect. Used to simulate server crashes without
	 * the full spawn-server/subprocess pipeline getting in the way.
	 */
	async function startFakeHandshakeServer(socketPath: string): Promise<{
		close: () => Promise<void>;
		/** Resolves with the accepted socket once a client connects. */
		accepted: Promise<net.Socket>;
	}> {
		let resolveAccepted: (s: net.Socket) => void = () => {};
		const accepted = new Promise<net.Socket>((r) => {
			resolveAccepted = r;
		});
		const srv = net.createServer((sock) => {
			let buf = "";
			sock.on("data", (chunk) => {
				buf += chunk.toString("utf8");
				const nl = buf.indexOf("\n");
				if (nl === -1) return;
				// Acknowledge handshake with fixed pid so openSpawnSession resolves.
				sock.write(`${JSON.stringify({ type: "ok", pid: 99999 })}\n`);
				resolveAccepted(sock);
			});
			sock.on("error", () => {
				// Swallow; the tests may destroy the socket deliberately.
			});
		});
		await new Promise<void>((res, rej) => {
			srv.once("error", rej);
			srv.listen(socketPath, () => res());
		});
		return {
			accepted,
			close: () =>
				new Promise<void>((res) => {
					srv.close(() => {
						try {
							fs.unlinkSync(socketPath);
						} catch {
							// already gone
						}
						res();
					});
				}),
		};
	}

	it("emits synthetic exit when server disconnects without sending exit frame", async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-synth-exit-"));
		const socketPath = path.join(tmpDir, "s.sock");
		const tokenPath = path.join(tmpDir, "s.token");
		fs.writeFileSync(tokenPath, "any-token");

		const fake = await startFakeHandshakeServer(socketPath);

		const session = await openSpawnSession({
			socketPath,
			tokenPath,
			env: {},
		});

		const exitPromise = new Promise<{
			code: number | null;
			signal: string | null;
		}>((resolve) => {
			session.once("exit", (code: number | null, signal: string | null) =>
				resolve({ code, signal }),
			);
		});
		// Swallow any error emitted by the abrupt disconnect so Node doesn't
		// escalate to an uncaughtException.
		session.on("error", () => {});

		// Destroy the server's side of the accepted client socket — no exit
		// frame is written, mimicking a crashed server.
		const sock = await fake.accepted;
		sock.destroy();

		const exit = await Promise.race([
			exitPromise,
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error("timed out waiting for synthetic exit")),
					2000,
				),
			),
		]);

		// Synthetic exit should be null/null
		expect(exit.code).toBeNull();
		expect(exit.signal).toBeNull();

		await fake.close();
	}, 10000);

	it("does not double-emit exit when real exit frame precedes close", async () => {
		const paths = setupEcho();
		server = await startSpawnServer(paths);
		const session = await openSpawnSession({
			socketPath: paths.socketPath,
			tokenPath: paths.tokenPath,
			env: {},
		});

		let exitCount = 0;
		session.on("exit", () => {
			exitCount += 1;
		});
		session.on("error", () => {});

		session.kill("SIGTERM");
		// Wait long enough for both the exit frame AND the close event to fire.
		await new Promise<void>((r) => setTimeout(r, 1000));

		expect(exitCount).toBe(1);
	}, 10000);

	it("does not crash when stream error has no listener attached", async () => {
		// Verify the safeEmitError path: if the server disconnects and no
		// `error` listener is attached, Node must not throw an unhandled error.
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-no-err-listener-"));
		const socketPath = path.join(tmpDir, "s.sock");
		const tokenPath = path.join(tmpDir, "s.token");
		fs.writeFileSync(tokenPath, "any-token");

		const fake = await startFakeHandshakeServer(socketPath);

		const session = await openSpawnSession({
			socketPath,
			tokenPath,
			env: {},
		});
		// Deliberately do NOT attach an error listener on `session`.
		// Disconnect the server-side socket abruptly.
		const sock = await fake.accepted;
		sock.destroy();

		// Wait for the teardown to settle; if safeEmitError misbehaves it will
		// surface as an uncaughtException and crash the test worker.
		await new Promise((r) => setTimeout(r, 300));
		expect(session.pid).toBeGreaterThan(0);

		await fake.close();
	}, 10000);
});
