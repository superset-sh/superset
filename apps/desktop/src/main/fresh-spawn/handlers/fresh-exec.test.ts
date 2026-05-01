import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { type SpawnServer, startSpawnServer } from "../spawn-server";

// Integration tests for the fresh-exec handler. These go through the full
// spawn-server stack (schema validation → auth → dispatch → handler).
//
// NOTE on coverage: node-pty's internal tty.ReadStream interacts poorly with
// Bun's test runtime on macOS (EAGAIN on non-blocking read causes the socket
// to close before data is delivered). Because of this, we do NOT assert on
// stdout/stderr framing from the PTY inside bun test — that path is covered
// at runtime under Electron/Node where tty.ReadStream behaves correctly.
// The handler code for onData/onExit mirrors pty-subprocess.ts, which is
// exercised end-to-end in manual/E2E tests.
//
// What we CAN test reliably here:
//   1. The handler accepts the request, spawns a PTY, and writes the
//      initial {type:"ok",pid} SpawnResponse.
//   2. When the client disconnects, the PTY is killed (SIGTERM → SIGKILL).
describe("fresh-exec handler (integration)", () => {
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

	function setup(): {
		socketPath: string;
		tokenPath: string;
		subprocessScriptPath: string;
	} {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-fresh-exec-"));
		// subprocessScriptPath is required by startSpawnServer but is not used
		// by the fresh-exec code path. Any existing file is fine.
		const subprocessScriptPath = path.join(tmpDir, "noop.js");
		fs.writeFileSync(subprocessScriptPath, "");
		return {
			socketPath: path.join(tmpDir, "s.sock"),
			tokenPath: path.join(tmpDir, "s.token"),
			subprocessScriptPath,
		};
	}

	/**
	 * Connect to the UDS server, send a single authenticated NDJSON request,
	 * and resolve with the first response line.
	 */
	function sendRequest(
		paths: { socketPath: string; tokenPath: string },
		req: Record<string, unknown>,
	): Promise<{ firstFrame: Record<string, unknown>; client: net.Socket }> {
		return new Promise((resolve, reject) => {
			const client = net.createConnection(paths.socketPath);
			let buffer = "";
			const onError = (err: Error) => {
				client.destroy();
				reject(err);
			};
			client.once("error", onError);
			client.on("data", (chunk: Buffer) => {
				buffer += chunk.toString("utf8");
				const idx = buffer.indexOf("\n");
				if (idx === -1) return;
				const line = buffer.slice(0, idx);
				client.off("error", onError);
				try {
					resolve({
						firstFrame: JSON.parse(line) as Record<string, unknown>,
						client,
					});
				} catch (err) {
					reject(err);
				}
			});
			client.once("connect", () => {
				const token = fs.readFileSync(paths.tokenPath, "utf8").trim();
				const full = { ...req, token };
				client.write(`${JSON.stringify(full)}\n`);
			});
		});
	}

	it("returns ok+pid for a valid fresh-exec request", async () => {
		const paths = setup();
		server = await startSpawnServer(paths);

		const { firstFrame, client } = await sendRequest(paths, {
			type: "fresh-exec",
			command: "/bin/sh",
			args: ["-c", "sleep 5"],
			cwd: "/tmp",
			env: { PATH: "/usr/bin:/bin" },
			ptyCols: 80,
			ptyRows: 24,
		});

		expect(firstFrame.type).toBe("ok");
		expect(typeof firstFrame.pid).toBe("number");
		expect((firstFrame.pid as number) > 0).toBe(true);

		// Clean up: disconnecting triggers the handler's SIGTERM → SIGKILL
		// path on the spawned PTY.
		client.destroy();
	}, 10000);

	it("kills PTY when the client disconnects", async () => {
		const paths = setup();
		server = await startSpawnServer(paths);

		const { firstFrame, client } = await sendRequest(paths, {
			type: "fresh-exec",
			command: "/bin/sh",
			args: ["-c", "sleep 30"],
			cwd: "/tmp",
			env: { PATH: "/usr/bin:/bin" },
			ptyCols: 80,
			ptyRows: 24,
		});

		expect(firstFrame.type).toBe("ok");
		const pid = firstFrame.pid as number;

		client.destroy();

		// Poll up to ~4s (handler SIGTERM grace is 2s before SIGKILL).
		const isAlive = (targetPid: number): boolean => {
			try {
				process.kill(targetPid, 0);
				return true;
			} catch {
				return false;
			}
		};
		let alive = true;
		for (let i = 0; i < 40; i++) {
			await new Promise((r) => setTimeout(r, 100));
			if (!isAlive(pid)) {
				alive = false;
				break;
			}
		}
		expect(alive).toBe(false);
	}, 15000);
});
