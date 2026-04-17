import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
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
});
