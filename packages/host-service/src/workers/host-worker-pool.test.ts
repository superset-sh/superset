import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { defineWorkerTask } from "./define-worker-task.ts";
import { HostWorkerPool } from "./host-worker-pool.ts";
import {
	gitStatusSnapshotTask,
	gitWorktreeRemoveTask,
	gitWorktreeStateTask,
} from "./tasks/git.ts";

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

const fixtureDirs: string[] = [];

afterEach(async () => {
	await Promise.all(pools.splice(0).map((p) => p.dispose()));
	for (const dir of fixtureDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 5_000) {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error(`test timed out after ${timeoutMs}ms`)),
					timeoutMs,
				);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

function makeFixtureRepo(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "host-worker-git-"));
	fixtureDirs.push(dir);
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

// A `git` shimmed onto the front of PATH that blocks on one subcommand:
// `gitEnv` is the spawned process's whole environment, so this is how a real
// task can be stalled in a chosen phase without stalling real git. The rest
// of PATH stays real — the shim needs `sleep`.
//
// It blocks on a sentinel rather than for a fixed duration: a `sleep` long
// enough to survive a loaded machine is also a `sleep` left running after the
// test, and one short enough to clean up can expire mid-assertion and let the
// task succeed. Waiting on its own existence gives an unbounded hang that
// afterEach's fixture cleanup releases within ~100ms.
function makeHangingGitShim(hangOn: "remove" | "list" | "status" | "none"): {
	dir: string;
	gitEnv: { PATH: string };
} {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "host-worker-gitshim-"));
	fixtureDirs.push(dir);
	const shim = path.join(dir, "git");
	const hang = `while [ -f "${shim}" ]; do sleep 0.1; done`;
	fs.writeFileSync(
		shim,
		`#!/bin/sh
case "$*" in
  *"worktree remove"*) ${hangOn === "remove" ? hang : ""} ;;
  *"worktree list"*) ${hangOn === "list" ? hang : ""} ;;
  status*) ${hangOn === "status" ? hang : ""} ;;
esac
exit 0
`,
		{ mode: 0o755 },
	);
	return { dir, gitEnv: { PATH: `${dir}:/usr/bin:/bin` } };
}

function shimInput(shim: { dir: string; gitEnv: { PATH: string } }) {
	return {
		repoPath: shim.dir,
		worktreePath: path.join(shim.dir, "wt"),
		gitEnv: shim.gitEnv,
	};
}

// Boot the worker before a timed run. A cold worker compiles the whole task
// module graph first (~300ms idle, more under load), which can burn a short
// budget before the handler runs at all — the task would then time out having
// reported nothing and the phase assertions would flake. Warm, the first
// phase is reported within a message hop of dispatch.
async function warmPool(pool: HostWorkerPool): Promise<void> {
	await pool.run(gitWorktreeRemoveTask, shimInput(makeHangingGitShim("none")));
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
	const error = await promise.then(
		() => null,
		(reason: Error) => reason,
	);
	if (!error) throw new Error("expected a rejection, got a resolved value");
	return error;
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
		expect(fromWorker.snapshot.unstaged.map((f) => f.path).sort()).toEqual([
			"a.txt",
			"c.txt",
		]);
		expect(fromWorker.snapshot.staged.map((f) => f.path)).toEqual([
			"staged.txt",
		]);
	});

	// HOST-SERVICE-17 / HOST-SERVICE-47: `git/removeWorktree` blows its budget
	// in the field and the timeout named only the budget, so the steps that
	// stall for unrelated reasons were indistinguishable. These drive the real
	// task through the real pool and worker and assert, on the exact message
	// the caller sees, that it says which step hung.
	test("worker timeout names the phase that was running (worktree-remove)", async () => {
		const shim = makeHangingGitShim("remove");
		const pool = makePool();
		await warmPool(pool);

		const error = await rejectionOf(
			pool.run(gitWorktreeRemoveTask, shimInput(shim), { timeoutMs: 1_000 }),
		);

		expect(error.message).toBe(
			'[host-worker] Task "git/removeWorktree" timed out after 1000ms in phase "worktree-remove"',
		);
	});

	test("worker timeout names the phase that was running (worktree-list)", async () => {
		// Same task, same budget, same shim — only the stalling subcommand
		// differs. A label that tracked the task rather than the step, or one
		// left over from the step before, fails here.
		const shim = makeHangingGitShim("list");
		const pool = makePool();
		await warmPool(pool);

		const error = await rejectionOf(
			pool.run(gitWorktreeRemoveTask, shimInput(shim), { timeoutMs: 1_000 }),
		);

		expect(error.message).toBe(
			'[host-worker] Task "git/removeWorktree" timed out after 1000ms in phase "worktree-list"',
		);
	});

	test("a task that reports no phase keeps its timeout message unchanged", async () => {
		// The other half of the contract: this adds information to a failure,
		// it does not change one. `git/worktreeState` reports no phases, so its
		// timeout must read exactly as it did before.
		const shim = makeHangingGitShim("status");
		const pool = makePool();
		await warmPool(pool);

		const error = await rejectionOf(
			pool.run(
				gitWorktreeStateTask,
				{ worktreePath: shim.dir, gitEnv: shim.gitEnv },
				{ timeoutMs: 1_000 },
			),
		);

		expect(error.message).toBe(
			'[host-worker] Task "git/worktreeState" timed out after 1000ms',
		);
	});

	test("inline timeout names the phase too", async () => {
		// The pool degrades to inline on a missing bundle or crash-looping
		// workers; that path enforces the same budget and must stay as
		// diagnosable as the worker one.
		const shim = makeHangingGitShim("remove");
		const pool = makePool({ scriptPathResolver: () => null });
		expect(pool.getMode()).toBe("inline");

		const error = await rejectionOf(
			pool.run(gitWorktreeRemoveTask, shimInput(shim), { timeoutMs: 1_000 }),
		);

		expect(error.message).toBe(
			'[host-worker] Task "git/removeWorktree" timed out after 1000ms in phase "worktree-remove" (inline)',
		);
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
		const pool = makePool({ idleTimeoutMs: 0 });
		await pool.run(gitStatusSnapshotTask, {
			worktreePath,
			gitEnv: { GIT_OPTIONAL_LOCKS: "0" },
		});
		const runner = pool.getRunner();
		expect(runner?.getWorkerCount()).toBe(1);
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
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
		expect(result.snapshot.unstaged.length).toBeGreaterThan(0);
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

	test("one crash with coalesced callers counts once toward the budget", async () => {
		const pool = makePool({ scriptPathResolver: () => CRASH_WORKER });
		let handlerRuns = 0;
		const echo = defineWorkerTask<{ v: number }, number>({
			type: "test/echo",
			handler: async ({ v }) => {
				handlerRuns++;
				return v;
			},
		});

		// Three callers coalesced onto one worker task; the single crash must
		// be recorded once — per-caller counting would consume the whole
		// budget (3) and open the circuit off a single worker death — and the
		// inline retry must also be shared, not run once per caller.
		const opts = { strategy: "coalesce" as const, dedupeKey: "same" };
		const [a, b, c] = await Promise.all([
			pool.run(echo, { v: 7 }, opts),
			pool.run(echo, { v: 7 }, opts),
			pool.run(echo, { v: 7 }, opts),
		]);
		expect(a).toBe(7);
		expect(b).toBe(7);
		expect(c).toBe(7);
		expect(handlerRuns).toBe(1);
		expect(pool.getMode()).toBe("worker");
	});

	test("inline fallback honors abort signal and timeout", async () => {
		const pool = makePool({ scriptPathResolver: () => null });
		const slow = defineWorkerTask<Record<string, never>, string>({
			type: "test/slow",
			handler: () => new Promise(() => {}),
		});

		const aborted = new AbortController();
		aborted.abort();
		await expect(
			pool.run(slow, {}, { signal: aborted.signal }),
		).rejects.toThrow("Worker task aborted");

		await expect(pool.run(slow, {}, { timeoutMs: 0 })).rejects.toThrow(
			"timed out after 0ms",
		);
	});

	test("a task queued behind a poison payload still completes", async () => {
		const pool = makePool({ concurrency: 1 });
		const echo = defineWorkerTask<{ v: number; fn?: unknown }, number>({
			type: "test/echo-drain",
			handler: async ({ v }) => v,
		});

		// One slot: t1 occupies it (worker round trip), t2's payload fails
		// postMessage at dispatch, t3 sits behind it. Without a re-drain, t3
		// strands with no timeout armed and only settles via t3's own timeout.
		const t1 = pool.run(echo, { v: 1 }).catch((e: Error) => e.message);
		const t2 = pool
			.run(echo, { v: 2, fn: () => 2 })
			.catch((e: Error) => e.message);
		const t3 = pool.run(echo, { v: 3 }).catch((e: Error) => e.message);

		const [r1, r2, r3] = await withTimeout(Promise.all([t1, t2, t3]));
		expect(r1).toContain("unknown worker task type");
		expect(r2).toContain("postMessage failed");
		expect(r3).toContain("unknown worker task type");
	});

	test("circuit-open rejects the queued backlog into the inline retry", async () => {
		const marker = path.join(
			fs.mkdtempSync(path.join(os.tmpdir(), "host-worker-crash-")),
			"spawns",
		);
		fixtureDirs.push(path.dirname(marker));
		process.env.CRASH_MARKER_FILE = marker;
		try {
			const pool = makePool({
				scriptPathResolver: () => CRASH_WORKER,
				concurrency: 1,
			});
			const echo = defineWorkerTask<{ v: number }, number>({
				type: "test/echo-backlog",
				handler: async ({ v }) => v,
			});

			// Distinct payloads (no dedupe): serial crashes burn the budget while
			// the rest queue. At circuit-open the queued tasks must reject into
			// the inline retry instead of each feeding a fresh crashing worker.
			const results = await withTimeout(
				Promise.all([1, 2, 3, 4, 5].map((v) => pool.run(echo, { v }))),
			);
			expect(results).toEqual([1, 2, 3, 4, 5]);
			expect(pool.getMode()).toBe("inline");
			// Budget is 3; one more task may already be mid-dispatch when the
			// circuit opens. Without the queued-backlog rejection, every task
			// spawns its own crashing worker (5 here).
			const spawns = fs.readFileSync(marker, "utf8").length;
			expect(spawns).toBeLessThanOrEqual(4);
		} finally {
			delete process.env.CRASH_MARKER_FILE;
		}
	});

	test("non-cloneable payload rejects without wedging the worker slot", async () => {
		const pool = makePool();
		const echo = defineWorkerTask<{ v: number; fn?: unknown }, number>({
			type: "test/echo-clone",
			handler: async ({ v }) => v,
		});

		await expect(
			pool.run(echo, { v: 1, fn: () => 1 }, { timeoutMs: 10_000 }),
		).rejects.toThrow("postMessage failed");
		// The slot must be free again: a valid task completes promptly via the
		// worker path (registry rejects the unknown type — still a worker round
		// trip, which is what proves the slot isn't wedged).
		await expect(withTimeout(pool.run(echo, { v: 2 }))).rejects.toThrow(
			"unknown worker task type",
		);
	});
});
