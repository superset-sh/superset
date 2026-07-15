import { expect, test } from "bun:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const packageRoot = path.resolve(import.meta.dir, "../..");

test("four backpressured adopted PTYs leave workers and a fifth PTY responsive", async () => {
	const cacheRoot = path.join(packageRoot, "node_modules", ".cache");
	mkdirSync(cacheRoot, { recursive: true });
	const tempDir = mkdtempSync(path.join(cacheRoot, "adopted-nonblocking-"));

	try {
		const build = await Bun.build({
			entrypoints: [path.join(import.meta.dir, "Pty.ts")],
			format: "esm",
			naming: "pty.mjs",
			outdir: tempDir,
			packages: "external",
			target: "node",
		});
		assert.equal(
			build.success,
			true,
			build.logs.map((log) => log.message).join("\n"),
		);
		const builtModule = build.outputs[0]?.path;
		assert.ok(builtModule, "Bun did not emit the adopted PTY test module");
		const moduleUrl = pathToFileURL(builtModule).href;

		const launcher = `
			const childProcess = require("node:child_process");
			const nodePty = require("node-pty");
			const moduleUrl = process.argv[1];
			const terms = [];
			let adopter = null;

			const blockedScript = [
				"import os, signal, time, tty",
				"tty.setraw(0)",
				"os.write(1, b'READY\\\\n')",
				"os.kill(os.getpid(), signal.SIGSTOP)",
				"time.sleep(60)",
			].join("\\n");
			const healthyScript = [
				"import os, tty",
				"tty.setraw(0)",
				"os.write(1, b'READY\\\\n')",
				"while True:",
				"    data = os.read(0, 4096)",
				"    if not data:",
				"        break",
				"    os.write(1, b'HEALTHY:' + data)",
			].join("\\n");

			function killBestEffort(pid) {
				if (!pid) return;
				try { process.kill(pid, "SIGKILL"); } catch {}
			}

			function cleanup() {
				for (const term of terms) killBestEffort(term.pid);
			}

			function waitForReady(term) {
				return new Promise((resolve, reject) => {
					const timeout = setTimeout(
						() => reject(new Error("PTY child did not become ready")),
						2_000,
					);
					term.onData((data) => {
						if (!data.includes("READY")) return;
						clearTimeout(timeout);
						resolve();
					});
				});
			}

			(async () => {
				for (let index = 0; index < 5; index += 1) {
					const term = nodePty.spawn(
						"/usr/bin/python3",
						["-c", index < 4 ? blockedScript : healthyScript],
						{ cols: 80, rows: 24 },
					);
					terms.push(term);
					await waitForReady(term);
				}

				const adopterSource = \`
					import { adoptFromFd } from \${JSON.stringify(moduleUrl)};
					import * as fs from "node:fs";
					import { pbkdf2 } from "node:crypto";

					const pids = JSON.parse(process.env.ADOPTED_PIDS);
					const ptys = pids.map((pid, index) => adoptFromFd({
						fd: 3 + index,
						pid,
						meta: { shell: "/usr/bin/python3", argv: [], cols: 80, rows: 24 },
					}));

					for (let index = 0; index < 4; index += 1) {
						ptys[index].write(Buffer.alloc(1024 * 1024, 65 + index));
					}

					let healthyOutput = "";
					const healthy = new Promise((resolve) => {
						ptys[4].onData((data) => {
							healthyOutput += data.toString("utf8");
							if (healthyOutput.includes("HEALTHY:PING")) resolve();
						});
					});
					const stat = new Promise((resolve, reject) => {
						fs.stat(process.execPath, (error) => error ? reject(error) : resolve());
					});
					const crypto = new Promise((resolve, reject) => {
						pbkdf2("x", "y", 1, 16, "sha256", (error) =>
							error ? reject(error) : resolve(),
						);
					});

					ptys[4].write(Buffer.from("PING"));
					const timeout = new Promise((_, reject) => {
						setTimeout(
							() => reject(new Error("worker pool or healthy PTY timed out")),
							1_000,
						);
					});
					await Promise.race([Promise.all([healthy, stat, crypto]), timeout]);

					for (const pty of ptys) {
						try { pty.kill("SIGKILL"); } catch {}
					}
					const result = JSON.stringify({
						crypto: true,
						healthy: true,
						node: process.version,
						stat: true,
					});
					process.stdout.write(result + "\\\\n", () => process.exit(0));
				\`;

				adopter = childProcess.spawn(
					process.execPath,
					["--input-type=module", "--eval", adopterSource],
					{
						env: {
							...process.env,
							ADOPTED_PIDS: JSON.stringify(terms.map((term) => term.pid)),
							UV_THREADPOOL_SIZE: "4",
						},
						stdio: [
							"ignore",
							"pipe",
							"pipe",
							...terms.map((term) => term._fd),
						],
					},
				);

				// The adopter now owns inherited copies. Stop the launcher's readers so
				// they cannot consume the healthy child's response first.
				for (const term of terms) {
					term._writeStream.dispose();
					term._socket.destroy();
				}

				let stdout = "";
				let stderr = "";
				adopter.stdout.on("data", (data) => { stdout += data; });
				adopter.stderr.on("data", (data) => { stderr += data; });
				adopter.on("exit", (code) => {
					cleanup();
					if (code !== 0) process.stderr.write(stderr || stdout);
					else process.stdout.write(stdout);
					process.exit(code ?? 1);
				});
			})().catch((error) => {
				cleanup();
				process.stderr.write(String(error?.stack ?? error));
				process.exit(1);
			});

			setTimeout(() => {
				cleanup();
				adopter?.kill("SIGKILL");
				process.stderr.write("adopted PTY launcher timed out\\n");
				process.exit(2);
			}, 5_000).unref();
		`;

		const run = spawnSync(
			"node",
			["--input-type=commonjs", "--eval", launcher, moduleUrl],
			{
				cwd: packageRoot,
				encoding: "utf8",
				env: { ...process.env, UV_THREADPOOL_SIZE: "4" },
				timeout: 10_000,
			},
		);
		assert.equal(
			run.status,
			0,
			`adopted PTY worker-pool child failed:\n${run.stderr || run.stdout}`,
		);
		const result = JSON.parse(run.stdout) as {
			crypto: boolean;
			healthy: boolean;
			node: string;
			stat: boolean;
		};
		expect(result.crypto).toBe(true);
		expect(result.healthy).toBe(true);
		expect(result.node).toMatch(/^v(?:20|2[1-9]|[3-9]\d)\./);
		expect(result.stat).toBe(true);
	} finally {
		rmSync(tempDir, { force: true, recursive: true });
	}
});
