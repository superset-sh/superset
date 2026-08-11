// Real-process tests for cooperative worker shutdown (issue #6152): retiring
// a worker with in-flight child processes must SIGKILL and reap them, not
// strand them as permanent zombies. Runs under Node
// (`node --experimental-strip-types --test`) because the assertions read real
// zombie state for this exact process out of `ps`; bun's worker/process
// internals differ from the production (node/Electron) runtime.

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, test } from "node:test";
import { WorkerTaskRunner } from "./WorkerTaskRunner.ts";

const SPAWNING_WORKER = path.resolve(
	import.meta.dirname,
	"test-fixtures",
	"spawning-worker.ts",
);
const SHUTDOWN_IGNORING_WORKER = path.resolve(
	import.meta.dirname,
	"test-fixtures",
	"shutdown-ignoring-worker.ts",
);
const RESPAWNING_WORKER = path.resolve(
	import.meta.dirname,
	"test-fixtures",
	"respawning-worker.ts",
);

const runners: WorkerTaskRunner[] = [];
function makeRunner(workerScriptPath: string, shutdownGraceMs?: number) {
	const runner = new WorkerTaskRunner({
		workerScriptPath,
		concurrency: 1,
		name: "termination-test",
		shutdownGraceMs,
	});
	runners.push(runner);
	return runner;
}

let pidFile: string | undefined;

afterEach(async () => {
	await Promise.all(runners.splice(0).map((r) => r.dispose()));
	if (pidFile) {
		fs.rmSync(path.dirname(pidFile), { recursive: true, force: true });
		pidFile = undefined;
		delete process.env.SPAWN_PID_FILE;
	}
});

function makePidFile(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-termination-"));
	pidFile = path.join(dir, "child-pid");
	process.env.SPAWN_PID_FILE = pidFile;
	return pidFile;
}

/** Zombie children of this process, per ps. A zombie also still answers
 * kill(pid, 0), so "pid fully gone" below means killed AND reaped. */
function zombieChildCount(): number {
	const out = execFileSync("ps", ["-axo", "pid=,ppid=,stat="], {
		encoding: "utf8",
	});
	return out
		.split("\n")
		.map((line) => line.trim().split(/\s+/))
		.filter(
			(parts) =>
				parts.length >= 3 &&
				parts[1] === String(process.pid) &&
				(parts[2] as string).includes("Z"),
		).length;
}

function pidExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function waitFor(
	condition: () => boolean,
	timeoutMs: number,
	label: string,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (condition()) return;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	assert.fail(`timed out after ${timeoutMs}ms waiting for ${label}`);
}

async function readSpawnedPid(file: string): Promise<number> {
	await waitFor(
		() => fs.existsSync(file) && fs.readFileSync(file, "utf8").includes("\n"),
		5_000,
		"fixture to report its child pid",
	);
	const pid = Number.parseInt(fs.readFileSync(file, "utf8").trim(), 10);
	assert.ok(Number.isInteger(pid) && pid > 0);
	return pid;
}

describe("WorkerTaskRunner termination", () => {
	test("task timeout SIGKILLs and reaps the worker's in-flight child", async () => {
		const file = makePidFile();
		const runner = makeRunner(SPAWNING_WORKER);

		await assert.rejects(
			runner.runTask("test/hang", {}, { timeoutMs: 300 }),
			/timed out after 300ms/,
		);

		const childPid = await readSpawnedPid(file);
		// Killed AND reaped: the pid must disappear entirely — a zombie would
		// still answer signal 0.
		await waitFor(
			() => !pidExists(childPid),
			5_000,
			`child ${childPid} to be killed and reaped`,
		);
		assert.equal(zombieChildCount(), 0);
	});

	test("task abort SIGKILLs and reaps the worker's in-flight child", async () => {
		const file = makePidFile();
		const runner = makeRunner(SPAWNING_WORKER);
		const controller = new AbortController();

		const task = assert.rejects(
			runner.runTask("test/hang", {}, { signal: controller.signal }),
			/aborted/,
		);
		const childPid = await readSpawnedPid(file);
		controller.abort();
		await task;

		await waitFor(
			() => !pidExists(childPid),
			5_000,
			`child ${childPid} to be killed and reaped`,
		);
		assert.equal(zombieChildCount(), 0);
	});

	test("children spawned from a killed child's exit callbacks are reaped too", async () => {
		const file = makePidFile();
		const runner = makeRunner(RESPAWNING_WORKER);

		await assert.rejects(
			runner.runTask("test/hang", {}, { timeoutMs: 300 }),
			/timed out after 300ms/,
		);

		// The fixture reports child A at spawn and successor B after A is
		// killed; both must be fully reaped, not just SIGKILLed on arrival.
		await waitFor(
			() =>
				fs.existsSync(file) &&
				fs.readFileSync(file, "utf8").trim().split("\n").length >= 2,
			5_000,
			"fixture to report the successor child pid",
		);
		const pids = fs
			.readFileSync(file, "utf8")
			.trim()
			.split("\n")
			.map((line) => Number.parseInt(line, 10));
		assert.equal(pids.length, 2);
		for (const pid of pids) {
			await waitFor(
				() => !pidExists(pid),
				5_000,
				`child ${pid} to be killed and reaped`,
			);
		}
		assert.equal(zombieChildCount(), 0);
	});

	test("worker ignoring shutdown is hard-terminated after the grace period", async () => {
		const runner = makeRunner(SHUTDOWN_IGNORING_WORKER, 300);

		await assert.rejects(
			runner.runTask("test/hang", {}, { timeoutMs: 200 }),
			/timed out/,
		);
		// dispose() resolves only when the worker exits — here that exit can
		// only come from the grace-timer terminate() fallback. Without the
		// fallback this would never settle.
		const disposed = runner.dispose().then(() => "disposed" as const);
		const timeout = new Promise<"timeout">((resolve) => {
			setTimeout(() => resolve("timeout"), 5_000).unref?.();
		});
		assert.equal(await Promise.race([disposed, timeout]), "disposed");
	});
});
