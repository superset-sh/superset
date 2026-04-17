import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	getFreshSpawnServerInstance,
	startFreshSpawnServer,
	stopFreshSpawnServer,
} from "./lifecycle";

describe("fresh-spawn lifecycle", () => {
	afterEach(async () => {
		await stopFreshSpawnServer();
	});

	it("no-op on non-darwin platforms", async () => {
		if (process.platform === "darwin") return; // skip on darwin

		await startFreshSpawnServer();
		expect(getFreshSpawnServerInstance()).toBeNull();
	});

	it("idempotent start (warning but no throw on duplicate start)", async () => {
		if (process.platform !== "darwin") return; // darwin-only path

		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-lifecycle-"));
		const subprocessScriptPath = path.join(tmpDir, "noop.js");
		fs.writeFileSync(
			subprocessScriptPath,
			`process.stdin.on("end", () => process.exit(0));\n`,
		);

		try {
			await startFreshSpawnServer({ subprocessScriptPath });
			const first = getFreshSpawnServerInstance();
			expect(first).not.toBeNull();

			await startFreshSpawnServer({ subprocessScriptPath }); // duplicate call should not throw
			expect(getFreshSpawnServerInstance()).toBe(first);
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("stop clears instance", async () => {
		if (process.platform !== "darwin") return;

		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-lifecycle-"));
		const subprocessScriptPath = path.join(tmpDir, "noop.js");
		fs.writeFileSync(
			subprocessScriptPath,
			`process.stdin.on("end", () => process.exit(0));\n`,
		);

		try {
			await startFreshSpawnServer({ subprocessScriptPath });
			expect(getFreshSpawnServerInstance()).not.toBeNull();
			await stopFreshSpawnServer();
			expect(getFreshSpawnServerInstance()).toBeNull();
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
