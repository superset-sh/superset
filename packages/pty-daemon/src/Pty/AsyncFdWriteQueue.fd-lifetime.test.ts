import { expect, test } from "bun:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

test("a submitted write cannot escape into a reused fd after disposal", async () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "pty-fd-lifetime-"));
	const build = await Bun.build({
		entrypoints: [path.join(import.meta.dir, "AsyncFdWriteQueue.ts")],
		format: "esm",
		naming: "queue.mjs",
		outdir: tempDir,
		target: "node",
	});
	assert.equal(
		build.success,
		true,
		build.logs.map((log) => log.message).join("\n"),
	);
	const builtModule = build.outputs[0]?.path;
	assert.ok(builtModule, "Bun did not emit the queue test module");
	const moduleUrl = pathToFileURL(builtModule).href;
	const script = `
		import { strict as assert } from "node:assert";
		import { pbkdf2 } from "node:crypto";
		import * as fs from "node:fs";
		import * as path from "node:path";
		import { AsyncFdWriteQueue } from ${JSON.stringify(moduleUrl)};

		const dir = process.argv[1];
		const unsafeAPath = path.join(dir, "unsafe-a");
		const unsafeBPath = path.join(dir, "unsafe-b");
		const safeAPath = path.join(dir, "safe-a");
		const safeBPath = path.join(dir, "safe-b");

		let blockerDone = false;
		const blocker = new Promise((resolve, reject) => {
			pbkdf2("password", "salt", 5_000_000, 32, "sha256", (error) => {
				blockerDone = true;
				if (error) reject(error);
				else resolve();
			});
		});

		// Control case: reproduce the Node/libuv hazard. With one worker occupied,
		// fs.write stores only the fd number. Closing A lets B reuse that number,
		// so the delayed write is applied to B.
		const unsafeA = fs.openSync(unsafeAPath, "w+");
		const unsafeWrite = new Promise((resolve, reject) => {
			const data = Buffer.from("LEAK");
			fs.write(unsafeA, data, 0, data.length, null, (error) => {
				if (error) reject(error);
				else resolve();
			});
		});
		fs.closeSync(unsafeA);
		const unsafeB = fs.openSync(unsafeBPath, "w+");
		assert.equal(unsafeB, unsafeA, "test harness did not force fd reuse");
		fs.writeSync(unsafeB, Buffer.from("BB"));

		// Fixed case: disposal stops accepting work but the queue keeps A open
		// until its already-submitted write callback. B therefore cannot reuse A.
		const safeA = fs.openSync(safeAPath, "w+");
		let safeClosed = false;
		let resolveSafeWriteSubmitted;
		const safeWriteSubmitted = new Promise((resolve) => {
			resolveSafeWriteSubmitted = resolve;
		});
		let resolveSafeClosed;
		const safeClose = new Promise((resolve) => {
			resolveSafeClosed = resolve;
		});
		const queue = new AsyncFdWriteQueue({
			fd: safeA,
			write(fd, buffer, offset, length, position, callback) {
				resolveSafeWriteSubmitted();
				fs.write(fd, buffer, offset, length, position, callback);
			},
			closeFd(fd) {
				fs.closeSync(fd);
				safeClosed = true;
				resolveSafeClosed();
			},
		});
		queue.enqueue(Buffer.from("LEAK"));
		await safeWriteSubmitted;
		assert.equal(blockerDone, false, "PBKDF2 did not hold the sole worker");
		queue.dispose();
		assert.equal(safeClosed, false, "fd closed before submitted write callback");
		const safeB = fs.openSync(safeBPath, "w+");
		assert.notEqual(safeB, safeA, "safe fd was reused before write completion");
		fs.writeSync(safeB, Buffer.from("BB"));

		await Promise.all([blocker, unsafeWrite, safeClose]);
		fs.closeSync(unsafeB);
		fs.closeSync(safeB);

		const result = {
			unsafeA,
			unsafeB,
			safeA,
			safeB,
			gotUnsafeB: fs.readFileSync(unsafeBPath, "utf8"),
			gotSafeA: fs.readFileSync(safeAPath, "utf8"),
			gotSafeB: fs.readFileSync(safeBPath, "utf8"),
			safeClosed,
		};
		process.stdout.write(JSON.stringify(result));
	`;

	try {
		const result = spawnSync(
			"node",
			["--input-type=module", "--eval", script, tempDir],
			{
				env: { ...process.env, UV_THREADPOOL_SIZE: "1" },
				encoding: "utf8",
				timeout: 10_000,
			},
		);
		assert.equal(
			result.status,
			0,
			`fd lifetime child failed:\n${result.stderr || result.stdout}`,
		);
		const output = JSON.parse(result.stdout) as {
			unsafeA: number;
			unsafeB: number;
			safeA: number;
			safeB: number;
			gotUnsafeB: string;
			gotSafeA: string;
			gotSafeB: string;
			safeClosed: boolean;
		};
		expect(output.unsafeB).toBe(output.unsafeA);
		expect(output.gotUnsafeB).toContain("LEAK");
		expect(output.safeB).not.toBe(output.safeA);
		expect(output.gotSafeA).toBe("LEAK");
		expect(output.gotSafeB).toBe("BB");
		expect(output.safeClosed).toBe(true);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
});
