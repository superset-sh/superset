import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { sendSpawnRequest } from "./spawn-client";
import { type SpawnServer, startSpawnServer } from "./spawn-server";

describe("sendSpawnRequest", () => {
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

	function mkdirs(): {
		socketPath: string;
		tokenPath: string;
		subprocessScriptPath: string;
	} {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-client-"));
		const subprocessScriptPath = path.join(tmpDir, "noop.js");
		fs.writeFileSync(
			subprocessScriptPath,
			`process.stdin.on("end", () => process.exit(0));\n`,
		);
		return {
			socketPath: path.join(tmpDir, "s.sock"),
			tokenPath: path.join(tmpDir, "s.token"),
			subprocessScriptPath,
		};
	}

	it("sends spawn-pty-subprocess, receives ok+pid from streaming handler", async () => {
		const paths = mkdirs();
		server = await startSpawnServer(paths);

		const resp = await sendSpawnRequest({
			socketPath: paths.socketPath,
			tokenPath: paths.tokenPath,
			request: {
				type: "spawn-pty-subprocess",
				env: { HOME: "/Users/test" },
			},
		});

		// The first NDJSON line from the server is {type:"ok", pid}. sendSpawnRequest
		// settles after that first line, so the client still sees a SpawnResponse
		// even though the server-side connection remains open for streaming.
		expect(resp.type).toBe("ok");
		if (resp.type === "ok") {
			expect(typeof resp.pid).toBe("number");
			expect(resp.pid).toBeGreaterThan(0);
		}
	});

	it("sends fresh-exec, receives ok+pid from server", async () => {
		const paths = mkdirs();
		server = await startSpawnServer(paths);

		const resp = await sendSpawnRequest({
			socketPath: paths.socketPath,
			tokenPath: paths.tokenPath,
			request: {
				type: "fresh-exec",
				// A long-lived command that we immediately tear down by letting
				// the test client disconnect at the end — avoids leaking a
				// real PTY-rooted process tree past the test.
				command: "/bin/sh",
				args: ["-c", "sleep 5"],
				cwd: "/tmp",
				env: { PATH: "/usr/bin:/bin" },
				ptyCols: 80,
				ptyRows: 24,
			},
		});

		expect(resp.type).toBe("ok");
		if (resp.type === "ok") {
			expect(resp.pid).toBeGreaterThan(0);
		}
	});

	it("rejects with timeout when server never responds", async () => {
		const paths = mkdirs();
		// Start server so token file and socket exist, but we override the
		// server-side idle timeout to be longer than the client timeout so the
		// client's timer fires first.
		server = await startSpawnServer({ ...paths, idleTimeoutMs: 5000 });

		// Monkey-patch: delete the token file after token read but server still
		// running. Instead, simpler approach: connect to a valid socket, but do
		// not let server respond. To ensure client times out, we construct a
		// request but the server would respond to it — so instead we use a
		// socket that exists (server's) but we set a very short client timeout
		// that fires before the server can respond. Since the skeleton server
		// responds immediately on receiving the line, we race against that.
		//
		// More reliable: start our own trivial TCP/UDS listener that accepts
		// but never writes.
		const silentSockPath = path.join(tmpDir, "silent.sock");
		const silentServer = await new Promise<{
			close: () => Promise<void>;
		}>((resolve, reject) => {
			// Lazy import to avoid top-level coupling
			import("node:net").then((net) => {
				const srv = net.createServer((_socket) => {
					// Accept connection but never respond.
				});
				srv.once("error", reject);
				srv.once("listening", () => {
					resolve({
						close: () =>
							new Promise<void>((res) => {
								srv.close(() => {
									try {
										fs.unlinkSync(silentSockPath);
									} catch {
										// ignore
									}
									res();
								});
							}),
					});
				});
				srv.listen(silentSockPath);
			});
		});

		try {
			await expect(
				sendSpawnRequest({
					socketPath: silentSockPath,
					tokenPath: paths.tokenPath,
					request: {
						type: "spawn-pty-subprocess",
						env: {},
					},
					timeoutMs: 150,
				}),
			).rejects.toThrow(/timeout/i);
		} finally {
			await silentServer.close();
		}
	});

	it("rejects when token file does not exist", async () => {
		const paths = mkdirs();
		// Do not start the server — we want the token read to fail first.
		const missingToken = path.join(tmpDir, "nope.token");

		await expect(
			sendSpawnRequest({
				socketPath: paths.socketPath,
				tokenPath: missingToken,
				request: {
					type: "spawn-pty-subprocess",
					env: {},
				},
			}),
		).rejects.toThrow(/ENOENT/);
	});

	it("rejects when socket path does not exist", async () => {
		const paths = mkdirs();
		// Generate a real token file but point at a non-existent socket.
		server = await startSpawnServer(paths);
		await server.close();
		server = null;
		// Socket file should be gone now but token remains.
		expect(fs.existsSync(paths.tokenPath)).toBe(true);
		expect(fs.existsSync(paths.socketPath)).toBe(false);

		await expect(
			sendSpawnRequest({
				socketPath: paths.socketPath,
				tokenPath: paths.tokenPath,
				request: {
					type: "spawn-pty-subprocess",
					env: {},
				},
				timeoutMs: 1000,
			}),
		).rejects.toThrow();
	});
});
