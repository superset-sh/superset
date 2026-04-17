import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { type SpawnServer, startSpawnServer } from "../spawn-server";

describe("spawn-pty-subprocess handler", () => {
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
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-handler-"));
		const echoScriptPath = path.join(tmpDir, "echo.js");
		// Simple echo: read stdin, write to stdout, exit on EOF.
		fs.writeFileSync(
			echoScriptPath,
			`process.stdin.on("data", (d) => process.stdout.write(d));
process.stdin.on("end", () => process.exit(0));
`,
		);
		return {
			socketPath: path.join(tmpDir, "s.sock"),
			tokenPath: path.join(tmpDir, "s.token"),
			subprocessScriptPath: echoScriptPath,
		};
	}

	it("spawns child and streams stdout frames back", async () => {
		const paths = setupEcho();
		server = await startSpawnServer(paths);
		const token = fs.readFileSync(paths.tokenPath, "utf8").trim();

		const client = net.createConnection(paths.socketPath);
		await new Promise<void>((resolve, reject) => {
			client.once("error", reject);
			client.once("connect", () => resolve());
		});
		client.write(
			`${JSON.stringify({
				type: "spawn-pty-subprocess",
				token,
				env: {},
			})}\n`,
		);

		const frames: Array<Record<string, unknown>> = [];
		await new Promise<void>((resolve) => {
			let buffer = "";
			let sentStdin = false;
			let sentSignal = false;
			client.on("data", (chunk) => {
				buffer += chunk.toString("utf8");
				let idx: number;
				// biome-ignore lint/suspicious/noAssignInExpressions: NDJSON line extractor
				while ((idx = buffer.indexOf("\n")) !== -1) {
					const line = buffer.slice(0, idx);
					buffer = buffer.slice(idx + 1);
					if (line.trim().length === 0) continue;
					const frame = JSON.parse(line) as Record<string, unknown>;
					frames.push(frame);

					// After we see ok, send a stdin frame
					if (frame.type === "ok" && !sentStdin) {
						sentStdin = true;
						client.write(
							`${JSON.stringify({
								type: "stdin",
								data: Buffer.from("hello\n").toString("base64"),
							})}\n`,
						);
					}

					// After we see the echoed stdout, send SIGTERM
					if (frame.type === "stdout" && !sentSignal) {
						sentSignal = true;
						client.write(
							`${JSON.stringify({ type: "signal", name: "SIGTERM" })}\n`,
						);
					}
				}
			});
			client.once("close", () => resolve());
		});

		// Expect at minimum: ok, stdout (echo of "hello\n"), exit
		expect(frames.length).toBeGreaterThanOrEqual(3);
		expect(frames[0]).toMatchObject({ type: "ok" });
		expect(typeof frames[0]?.pid).toBe("number");

		const stdoutFrame = frames.find((f) => f.type === "stdout") as
			| { type: "stdout"; data: string }
			| undefined;
		expect(stdoutFrame).toBeDefined();
		expect(
			Buffer.from(stdoutFrame?.data ?? "", "base64").toString("utf8"),
		).toBe("hello\n");

		const exitFrame = frames.find((f) => f.type === "exit");
		expect(exitFrame).toBeDefined();
	}, 10000);

	it("kills child on client disconnect", async () => {
		const paths = setupEcho();
		server = await startSpawnServer(paths);
		const token = fs.readFileSync(paths.tokenPath, "utf8").trim();

		const client = net.createConnection(paths.socketPath);
		await new Promise<void>((resolve, reject) => {
			client.once("error", reject);
			client.once("connect", () => resolve());
		});

		// Read initial ok frame to get pid, then disconnect.
		const pid = await new Promise<number>((resolve, reject) => {
			let buffer = "";
			client.on("data", (chunk) => {
				buffer += chunk.toString("utf8");
				const idx = buffer.indexOf("\n");
				if (idx !== -1) {
					try {
						const frame = JSON.parse(buffer.slice(0, idx)) as {
							type: string;
							pid?: number;
						};
						if (frame.type === "ok" && typeof frame.pid === "number") {
							resolve(frame.pid);
						} else {
							reject(
								new Error(`expected ok frame, got: ${JSON.stringify(frame)}`),
							);
						}
					} catch (err) {
						reject(err);
					}
				}
			});
			client.write(
				`${JSON.stringify({
					type: "spawn-pty-subprocess",
					token,
					env: {},
				})}\n`,
			);
		});

		// Disconnect without sending a signal — server should SIGTERM the child.
		client.destroy();

		// Poll briefly, then check that the child is gone.
		const isAlive = (targetPid: number): boolean => {
			try {
				process.kill(targetPid, 0); // signal 0 = probe
				return true;
			} catch {
				return false;
			}
		};
		// Wait up to ~3 seconds for the child to die.
		let alive = true;
		for (let i = 0; i < 30; i++) {
			await new Promise((r) => setTimeout(r, 100));
			if (!isAlive(pid)) {
				alive = false;
				break;
			}
		}
		expect(alive).toBe(false);
	}, 10000);
});
