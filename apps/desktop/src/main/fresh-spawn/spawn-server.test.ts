import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { readTokenFile } from "./auth";
import { type SpawnServer, startSpawnServer } from "./spawn-server";

describe("SpawnServer", () => {
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

	function mkdirs(): { socketPath: string; tokenPath: string } {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-server-"));
		return {
			socketPath: path.join(tmpDir, "s.sock"),
			tokenPath: path.join(tmpDir, "s.token"),
		};
	}

	/**
	 * Connect to the UDS server, send a single NDJSON line,
	 * and resolve with the first response line trimmed of its trailing newline.
	 */
	function roundTrip(sockPath: string, line: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const client = net.createConnection(sockPath);
			let received = "";
			const onError = (err: Error) => {
				client.destroy();
				reject(err);
			};
			client.once("error", onError);
			client.once("connect", () => {
				client.write(`${line}\n`);
			});
			client.on("data", (data) => {
				received += data.toString("utf8");
				const nl = received.indexOf("\n");
				if (nl !== -1) {
					client.off("error", onError);
					client.destroy();
					resolve(received.slice(0, nl));
				}
			});
			client.once("end", () => {
				if (!received.includes("\n")) {
					reject(new Error("server closed connection without responding"));
				}
			});
		});
	}

	it("starts on given socket path (file exists after startup)", async () => {
		const paths = mkdirs();
		server = await startSpawnServer(paths);
		expect(fs.existsSync(paths.socketPath)).toBe(true);
	});

	it("creates token file with 0600 mode", async () => {
		const paths = mkdirs();
		server = await startSpawnServer(paths);
		expect(fs.existsSync(paths.tokenPath)).toBe(true);
		const mode = fs.statSync(paths.tokenPath).mode & 0o777;
		expect(mode).toBe(0o600);
	});

	it("responds with E_PARSE on invalid JSON", async () => {
		const paths = mkdirs();
		server = await startSpawnServer(paths);

		const resp = await roundTrip(paths.socketPath, "not-valid-json{");
		const parsed = JSON.parse(resp);
		expect(parsed.type).toBe("error");
		expect(parsed.code).toBe("E_PARSE");
	});

	it("responds with E_SCHEMA on schema-invalid request", async () => {
		const paths = mkdirs();
		server = await startSpawnServer(paths);

		// Missing required `env` field and unknown `type`
		const resp = await roundTrip(
			paths.socketPath,
			JSON.stringify({ type: "bogus-type", token: "whatever" }),
		);
		const parsed = JSON.parse(resp);
		expect(parsed.type).toBe("error");
		expect(parsed.code).toBe("E_SCHEMA");
	});

	it("responds with E_AUTH on bad token", async () => {
		const paths = mkdirs();
		server = await startSpawnServer(paths);

		const resp = await roundTrip(
			paths.socketPath,
			JSON.stringify({
				type: "spawn-pty-subprocess",
				token: "WRONG_TOKEN_OF_DIFFERENT_LENGTH",
				env: {},
			}),
		);
		const parsed = JSON.parse(resp);
		expect(parsed.type).toBe("error");
		expect(parsed.code).toBe("E_AUTH");
	});

	it("responds with E_TODO on valid authenticated spawn-pty-subprocess request", async () => {
		const paths = mkdirs();
		server = await startSpawnServer(paths);
		const token = readTokenFile(paths.tokenPath);

		const resp = await roundTrip(
			paths.socketPath,
			JSON.stringify({
				type: "spawn-pty-subprocess",
				token,
				env: { HOME: "/Users/test" },
			}),
		);
		const parsed = JSON.parse(resp);
		expect(parsed.type).toBe("error");
		expect(parsed.code).toBe("E_TODO");
	});

	it("close() removes the socket file", async () => {
		const paths = mkdirs();
		server = await startSpawnServer(paths);
		expect(fs.existsSync(paths.socketPath)).toBe(true);

		await server.close();
		server = null;

		expect(fs.existsSync(paths.socketPath)).toBe(false);
	});
});
