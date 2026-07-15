import { expect, test } from "bun:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const packageRoot = path.resolve(import.meta.dir, "../..");
const scenarios = ["constructor", "resize", "failed-child-handoff"] as const;

for (const scenario of scenarios) {
	test(`four backpressured adopted PTYs leave workers responsive after ${scenario}`, async () => {
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
			const scenario = process.argv[2];
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
					import { spawn as spawnChild, spawnSync as probeSync } from "node:child_process";
					import * as fs from "node:fs";
					import { pbkdf2 } from "node:crypto";

					const pids = JSON.parse(process.env.ADOPTED_PIDS);
					const ptys = pids.map((pid, index) => adoptFromFd({
						fd: 3 + index,
						pid,
						meta: { shell: "/usr/bin/python3", argv: [], cols: 80, rows: 24 },
					}));
					const scenario = process.env.NONBLOCKING_SCENARIO;
					const assertNonBlocking = (fd, label) => {
						if (process.platform === "linux") {
							const info = fs.readFileSync("/proc/self/fdinfo/" + fd, "utf8");
							const flags = /^flags:\\s+([0-7]+)/m.exec(info)?.[1];
							if (!flags || (Number.parseInt(flags, 8) & 0o4000) === 0) {
								throw new Error(label + " fd is blocking: " + info);
							}
							return;
						}
						if (process.platform === "darwin") {
							const probe = probeSync(
								"/usr/sbin/lsof",
								["+fg", "-a", "-p", String(process.pid), "-d", String(fd)],
								{ encoding: "utf8" },
							);
							if (probe.status !== 0 || !/(?:^|[,;])NB(?:[,;\\s]|$)/m.test(probe.stdout)) {
								throw new Error(label + " fd is blocking: " + probe.stdout);
							}
						}
					};
					for (const pty of ptys) {
						assertNonBlocking(pty.getMasterFd(), "constructor");
					}

					if (scenario === "resize") {
						for (let index = 0; index < ptys.length; index += 1) {
							ptys[index].resize(90 + index, 30 + index);
							assertNonBlocking(ptys[index].getMasterFd(), "resize");
						}
					} else if (scenario === "failed-child-handoff") {
						const failedChild = spawnChild(
							process.execPath,
							["--eval", "process.exit(17)"],
							{
								stdio: [
									"ignore",
									"ignore",
									"ignore",
									...ptys.map((pty) => pty.getMasterFd()),
								],
							},
						);
						const failedCode = await new Promise((resolve, reject) => {
							failedChild.once("error", reject);
							failedChild.once("exit", (code) => resolve(code));
						});
						if (failedCode !== 17) {
							throw new Error("handoff probe child exited " + failedCode);
						}
						for (const pty of ptys) {
							pty.restoreAfterFailedHandoff();
							assertNonBlocking(pty.getMasterFd(), "failed handoff restore");
						}
					}

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
						scenario,
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
								NONBLOCKING_SCENARIO: scenario,
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
				["--input-type=commonjs", "--eval", launcher, moduleUrl, scenario],
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
				scenario: string;
				stat: boolean;
			};
			expect(result.crypto).toBe(true);
			expect(result.healthy).toBe(true);
			expect(result.node).toMatch(/^v(?:20|2[1-9]|[3-9]\d)\./);
			expect(result.scenario).toBe(scenario);
			expect(result.stat).toBe(true);
		} finally {
			rmSync(tempDir, { force: true, recursive: true });
		}
	});
}

test("spawned NodePtyAdapter restores O_NONBLOCK after a failed child handoff", async () => {
	const cacheRoot = path.join(packageRoot, "node_modules", ".cache");
	mkdirSync(cacheRoot, { recursive: true });
	const tempDir = mkdtempSync(path.join(cacheRoot, "spawned-nonblocking-"));

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
		assert.ok(builtModule, "Bun did not emit the spawned PTY test module");
		const moduleUrl = pathToFileURL(builtModule).href;
		const source = `
			import { spawn as spawnPty } from ${JSON.stringify(moduleUrl)};
			import { spawn as spawnChild, spawnSync as probeSync } from "node:child_process";
			import * as fs from "node:fs";

			const pty = spawnPty({
				meta: { shell: "/bin/cat", argv: [], cols: 80, rows: 24 },
			});
			const fd = pty.getMasterFd();
			const isNonBlocking = () => {
				if (process.platform === "linux") {
					const info = fs.readFileSync("/proc/self/fdinfo/" + fd, "utf8");
					const flags = /^flags:\\s+([0-7]+)/m.exec(info)?.[1];
					return Boolean(flags && (Number.parseInt(flags, 8) & 0o4000) !== 0);
				}
				if (process.platform === "darwin") {
					const probe = probeSync(
						"/usr/sbin/lsof",
						["+fg", "-a", "-p", String(process.pid), "-d", String(fd)],
						{ encoding: "utf8" },
					);
					return probe.status === 0 && /(?:^|[,;])NB(?:[,;\\s]|$)/m.test(probe.stdout);
				}
				return true;
			};

			if (!isNonBlocking()) throw new Error("spawned PTY started blocking");
			const failedChild = spawnChild(
				process.execPath,
				["--eval", "process.exit(17)"],
				{ stdio: ["ignore", "ignore", "ignore", fd] },
			);
			const failedCode = await new Promise((resolve, reject) => {
				failedChild.once("error", reject);
				failedChild.once("exit", (code) => resolve(code));
			});
			if (failedCode !== 17) throw new Error("probe child exited " + failedCode);
			if (isNonBlocking()) {
				throw new Error("probe child did not reproduce shared OFD blocking mode");
			}
			pty.restoreAfterFailedHandoff();
			if (!isNonBlocking()) throw new Error("restore hook left spawned PTY blocking");
			try { pty.kill("SIGKILL"); } catch {}
			process.stdout.write(JSON.stringify({ node: process.version, restored: true }) + "\\n");
		`;
		const run = spawnSync("node", ["--input-type=module", "--eval", source], {
			cwd: packageRoot,
			encoding: "utf8",
			timeout: 5_000,
		});
		assert.equal(
			run.status,
			0,
			`spawned PTY failed-handoff child failed:\n${run.stderr || run.stdout}`,
		);
		const result = JSON.parse(run.stdout) as {
			node: string;
			restored: boolean;
		};
		expect(result.node).toMatch(/^v(?:20|2[1-9]|[3-9]\d)\./);
		expect(result.restored).toBe(true);
	} finally {
		rmSync(tempDir, { force: true, recursive: true });
	}
});

test("spawned NodePtyAdapter freezes and drains pending input exactly once", async () => {
	const cacheRoot = path.join(packageRoot, "node_modules", ".cache");
	mkdirSync(cacheRoot, { recursive: true });
	const tempDir = mkdtempSync(path.join(cacheRoot, "spawned-handoff-drain-"));

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
		assert.ok(builtModule, "Bun did not emit the spawned PTY drain module");
		const moduleUrl = pathToFileURL(builtModule).href;
		const source = `
			import { spawn as spawnPty } from ${JSON.stringify(moduleUrl)};
			import { spawnSync as runSync } from "node:child_process";
			import { createHash } from "node:crypto";

			// Several megabytes are far above the macOS PTY kernel buffer, so this
			// deterministically exercises node-pty's queued-write drain. Keep enough
			// scheduling margin for the production 2s fail-closed timeout on a busy CI
			// host; the test checks ordering and exactness, not disk-like throughput.
			const inputBytes = 4 * 1024 * 1024;
			const readerSource = [
				"import hashlib, os, select, termios, tty",
				"tty.setraw(0, termios.TCSANOW)",
				"os.write(1, b'READER_READY\\\\n')",
				"remaining = " + inputBytes,
				"digest = hashlib.sha256()",
				"total = 0",
				"while remaining:",
				"    chunk = os.read(0, min(65536, remaining))",
				"    if not chunk: break",
				"    digest.update(chunk)",
				"    total += len(chunk)",
				"    remaining -= len(chunk)",
				"readable, _, _ = select.select([0], [], [], 0.25)",
				"extra = os.read(0, 65536) if readable else b''",
				"result = f'DRAIN_RESULT:{total}:{digest.hexdigest()}:{len(extra)}\\\\n'",
				"os.write(1, result.encode())",
			].join("\\n");
			const pty = spawnPty({
				meta: {
					shell: "/usr/bin/python3",
					argv: ["-c", readerSource],
					cols: 80,
					rows: 24,
				},
			});
			let output = "";
			let readyResolve;
			let resultResolve;
			const ready = new Promise((resolve) => { readyResolve = resolve; });
			const resultLine = new Promise((resolve) => { resultResolve = resolve; });
			pty.onData((chunk) => {
				output += Buffer.from(chunk).toString("utf8");
				if (output.includes("READER_READY")) readyResolve();
				const match = /DRAIN_RESULT:(\\d+):([0-9a-f]+):(\\d+)/.exec(output);
				if (match) resultResolve(match);
			});
			const timeout = (label, ms) => new Promise((_, reject) =>
				setTimeout(() => reject(new Error(label + " timed out; output=" + output)), ms),
			);
			await Promise.race([ready, timeout("reader ready", 2000)]);
			process.kill(pty.pid, "SIGSTOP");
			const stoppedDeadline = Date.now() + 1000;
			while (true) {
				const state = runSync("/bin/ps", ["-o", "state=", "-p", String(pty.pid)], {
					encoding: "utf8",
				}).stdout.trim();
				if (state.startsWith("T")) break;
				if (Date.now() >= stoppedDeadline) {
					throw new Error("PTY child did not enter stopped state: " + state);
				}
				await new Promise((resolve) => setTimeout(resolve, 5));
			}

			const payload = Buffer.alloc(inputBytes);
			for (let offset = 0; offset < payload.length; offset += 1) {
				payload[offset] = offset % 251;
			}
			const expectedDigest = createHash("sha256").update(payload).digest("hex");
			pty.write(payload);
			const draining = pty.prepareForHandoff();
			let rejected = false;
			try {
				pty.write(Buffer.from("must-not-enter-node-pty-queue"));
			} catch (error) {
				rejected = /frozen for daemon handoff/.test(String(error));
			}
			if (!rejected) throw new Error("write was accepted after handoff freeze");

			let drainedWhileStopped = false;
			draining.then(() => { drainedWhileStopped = true; });
			await new Promise((resolve) => setTimeout(resolve, 50));
			if (drainedWhileStopped) {
				throw new Error("node-pty queue reported drained while slave was stopped");
			}
			process.kill(pty.pid, "SIGCONT");
			await Promise.race([draining, timeout("handoff drain", 2000)]);
			const match = await Promise.race([resultLine, timeout("reader result", 3000)]);
			if (Number(match[1]) !== inputBytes) {
				throw new Error("wrong delivered byte count: " + match[1]);
			}
			if (match[2] !== expectedDigest) {
				throw new Error("input digest mismatch: " + match[2]);
			}
			if (Number(match[3]) !== 0) {
				throw new Error("input was delivered more than once; extra=" + match[3]);
			}
			pty.cancelHandoff();
			try { pty.kill("SIGKILL"); } catch {}
			process.stdout.write(JSON.stringify({
				drained: true,
				exactlyOnce: true,
				node: process.version,
			}) + "\\n");
		`;
		const run = spawnSync("node", ["--input-type=module", "--eval", source], {
			cwd: packageRoot,
			encoding: "utf8",
			timeout: 8_000,
		});
		assert.equal(
			run.status,
			0,
			`spawned PTY handoff-drain child failed:\n${run.stderr || run.stdout}`,
		);
		const result = JSON.parse(run.stdout) as {
			drained: boolean;
			exactlyOnce: boolean;
			node: string;
		};
		expect(result.drained).toBe(true);
		expect(result.exactlyOnce).toBe(true);
		expect(result.node).toMatch(/^v(?:20|2[1-9]|[3-9]\d)\./);
	} finally {
		rmSync(tempDir, { force: true, recursive: true });
	}
});

test("NodePtyAdapter abort returns paused output exactly once and resumes live output", async () => {
	const cacheRoot = path.join(packageRoot, "node_modules", ".cache");
	mkdirSync(cacheRoot, { recursive: true });
	const tempDir = mkdtempSync(path.join(cacheRoot, "spawned-output-abort-"));

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
		assert.ok(builtModule, "Bun did not emit the spawned PTY abort module");
		const moduleUrl = pathToFileURL(builtModule).href;
		const source = `
			import { spawn as spawnPty } from ${JSON.stringify(moduleUrl)};

			const pty = spawnPty({
				meta: {
					shell: "/bin/sh",
					argv: [
						"-c",
						"read gate; sleep 0.15; printf 'ABORTSEQ:0001\\nABORTSEQ:0002\\nABORTSEQ:0003\\n'; sleep 0.5; printf 'LIVESEQ:0004\\n'; sleep 1",
					],
					cols: 80,
					rows: 24,
				},
			});
			const callbackChunks = [];
			pty.onData((chunk) => callbackChunks.push(Buffer.from(chunk)));
			pty.write(Buffer.from("go\\n"));
			await pty.prepareForHandoff();
			pty.pauseOutputForHandoff();
			await new Promise((resolve) => setTimeout(resolve, 350));
			const drained = await pty.drainOutputForHandoff();
			pty.cancelHandoff();

			const deadline = Date.now() + 2500;
			while (!Buffer.concat(callbackChunks).includes(Buffer.from("LIVESEQ:0004"))) {
				if (Date.now() >= deadline) {
					throw new Error("live output did not resume after cancelHandoff");
				}
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			const combined = Buffer.concat([...drained, ...callbackChunks]).toString("utf8");
			const abortSequence = [...combined.matchAll(/ABORTSEQ:(\\d{4})/g)].map(
				(match) => Number(match[1]),
			);
			if (JSON.stringify(abortSequence) !== JSON.stringify([1, 2, 3])) {
				throw new Error("paused output duplicated or gapped: " + JSON.stringify(abortSequence));
			}
			const liveCount = [...combined.matchAll(/LIVESEQ:0004/g)].length;
			if (liveCount !== 1) throw new Error("live output count was " + liveCount);
			try { pty.kill("SIGKILL"); } catch {}
			process.stdout.write(JSON.stringify({
				abortSequence,
				liveCount,
				node: process.version,
			}) + "\\n");
		`;
		const run = spawnSync("node", ["--input-type=module", "--eval", source], {
			cwd: packageRoot,
			encoding: "utf8",
			timeout: 7_000,
		});
		assert.equal(
			run.status,
			0,
			`spawned PTY output-abort child failed:\n${run.stderr || run.stdout}`,
		);
		const result = JSON.parse(run.stdout) as {
			abortSequence: number[];
			liveCount: number;
			node: string;
		};
		expect(result.abortSequence).toEqual([1, 2, 3]);
		expect(result.liveCount).toBe(1);
		expect(result.node).toMatch(/^v(?:20|2[1-9]|[3-9]\d)\./);
	} finally {
		rmSync(tempDir, { force: true, recursive: true });
	}
});
