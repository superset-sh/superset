import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { defineWorkerTask } from "./define-worker-task.ts";
import { HostWorkerPool } from "./host-worker-pool.ts";
import { gitStatusSnapshotTask } from "./tasks/git.ts";

const WORKER_ENTRY = path.resolve(import.meta.dirname, "host-worker.ts");
const CRASH_WORKER = path.resolve(
	import.meta.dirname,
	"test-fixtures",
	"crashing-worker.ts",
);

const pools: HostWorkerPool[] = [];
function makePool(options?: ConstructorParameters<typeof HostWorkerPool>[0]) {
	const pool = new HostWorkerPool({
		scriptPathResolver: () => WORKER_ENTRY,
		...options,
	});
	pools.push(pool);
	return pool;
}

afterEach(async () => {
	await Promise.all(pools.splice(0).map((p) => p.dispose()));
});

function makeFixtureRepo(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "host-worker-git-"));
	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd: dir, stdio: "pipe" });
	git("init", "-q", "-b", "main");
	fs.writeFileSync(path.join(dir, "a.txt"), "one\ntwo\n");
	fs.writeFileSync(path.join(dir, "b.txt"), "alpha\n");
	git("add", "-A", "--", ".");
	git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init");
	// one modified, one staged, one untracked — exercises every snapshot bucket
	fs.appendFileSync(path.join(dir, "a.txt"), "three\n");
	fs.writeFileSync(path.join(dir, "c.txt"), "new file\n");
	fs.writeFileSync(path.join(dir, "staged.txt"), "staged\n");
	git("add", "--", "staged.txt");
	return dir;
}

describe("HostWorkerPool", () => {
	test("worker result matches inline handler result (parity)", async () => {
		const worktreePath = makeFixtureRepo();
		const input = { worktreePath, gitEnv: { GIT_OPTIONAL_LOCKS: "0" } };

		const pool = makePool();
		expect(pool.getMode()).toBe("worker");
		const fromWorker = await pool.run(gitStatusSnapshotTask, input);
		const inline = await gitStatusSnapshotTask.handler(input);

		expect(fromWorker).toEqual(inline);
		expect(fromWorker.unstaged.map((f) => f.path).sort()).toEqual([
			"a.txt",
			"c.txt",
		]);
		expect(fromWorker.staged.map((f) => f.path)).toEqual(["staged.txt"]);
	});

	test("unknown task type rejects with the worker's error", async () => {
		const pool = makePool();
		const bogus = defineWorkerTask<Record<string, never>, never>({
			type: "nope/missing",
			handler: () => {
				throw new Error("inline handler must not run for worker-mode errors");
			},
		});
		await expect(pool.run(bogus, {})).rejects.toThrow(
			"unknown worker task type: nope/missing",
		);
	});

	test("idle workers are reaped after idleTimeoutMs", async () => {
		const worktreePath = makeFixtureRepo();
		const pool = makePool({ idleTimeoutMs: 250 });
		await pool.run(gitStatusSnapshotTask, {
			worktreePath,
			gitEnv: { GIT_OPTIONAL_LOCKS: "0" },
		});
		const runner = pool.getRunner();
		expect(runner?.getWorkerCount()).toBe(1);
		await new Promise((r) => setTimeout(r, 600));
		expect(runner?.getWorkerCount()).toBe(0);
	});

	test("missing bundle falls back to inline execution", async () => {
		const worktreePath = makeFixtureRepo();
		const pool = makePool({ scriptPathResolver: () => null });
		const result = await pool.run(gitStatusSnapshotTask, {
			worktreePath,
			gitEnv: { GIT_OPTIONAL_LOCKS: "0" },
		});
		expect(pool.getMode()).toBe("inline");
		expect(result.unstaged.length).toBeGreaterThan(0);
	});

	test("worker crash retries inline; crash loop opens the circuit", async () => {
		const pool = makePool({ scriptPathResolver: () => CRASH_WORKER });
		const echo = defineWorkerTask<{ v: number }, number>({
			type: "test/echo",
			handler: async ({ v }) => v,
		});

		// Every worker run crashes; each call must still succeed via the
		// inline retry. After the crash budget the pool goes inline-only.
		expect(await pool.run(echo, { v: 1 })).toBe(1);
		expect(await pool.run(echo, { v: 2 })).toBe(2);
		expect(await pool.run(echo, { v: 3 })).toBe(3);
		expect(pool.getMode()).toBe("inline");
		// Circuit open: no worker involved anymore, still correct results.
		expect(await pool.run(echo, { v: 4 })).toBe(4);
	});
});
