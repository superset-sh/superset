import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	type SpawnServer,
	startSpawnServer,
} from "../fresh-spawn/spawn-server";
import { trySpawnViaFreshServer } from "./fresh-spawn-integration";

describe("trySpawnViaFreshServer", () => {
	let server: SpawnServer | null = null;
	let tmpDir = "";

	afterEach(async () => {
		if (server) {
			await server.close();
			server = null;
		}
		if (tmpDir && fs.existsSync(tmpDir)) {
			fs.rmSync(tmpDir, { recursive: true });
			tmpDir = "";
		}
	});

	it("returns null when socket path does not exist", async () => {
		const result = await trySpawnViaFreshServer({
			socketPath: "/nonexistent/path.sock",
			tokenPath: "/nonexistent/path.token",
			env: {},
		});
		expect(result).toBeNull();
	});

	it("returns null when token path does not exist", async () => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-int-tokenmissing-"));
		const sockPath = path.join(tmpDir, "s.sock");
		// Create a placeholder "socket" (empty file) so the socket existence
		// check passes but the token existence check fails.
		fs.writeFileSync(sockPath, "");

		const result = await trySpawnViaFreshServer({
			socketPath: sockPath,
			tokenPath: path.join(tmpDir, "nonexistent.token"),
			env: {},
		});
		expect(result).toBeNull();
	});

	it("returns null when platform is not darwin", async () => {
		if (process.platform !== "darwin") {
			const result = await trySpawnViaFreshServer({
				socketPath: "/tmp/whatever.sock",
				tokenPath: "/tmp/whatever.token",
				env: {},
			});
			expect(result).toBeNull();
		} else {
			// skip on macOS
			expect(true).toBe(true);
		}
	});

	it("returns SpawnSession when server is reachable", async () => {
		if (process.platform !== "darwin") return; // skip non-darwin
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-int-"));
		const echoPath = path.join(tmpDir, "echo.js");
		fs.writeFileSync(
			echoPath,
			`process.stdin.on("data", (d) => process.stdout.write(d));
process.stdin.on("end", () => process.exit(0));
`,
		);
		const sockPath = path.join(tmpDir, "s.sock");
		const tokenPath = path.join(tmpDir, "s.token");

		server = await startSpawnServer({
			socketPath: sockPath,
			tokenPath,
			subprocessScriptPath: echoPath,
		});

		const session = await trySpawnViaFreshServer({
			socketPath: sockPath,
			tokenPath,
			env: {},
		});

		expect(session).not.toBeNull();
		expect(session?.pid).toBeGreaterThan(0);

		// Clean up: kill it so child doesn't linger
		session?.kill("SIGTERM");
		await new Promise((r) => setTimeout(r, 200));
	}, 10000);
});
