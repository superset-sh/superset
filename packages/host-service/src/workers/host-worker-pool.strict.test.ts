import { expect, mock, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";

if (process.env.SUPERSET_STRICT_POOL_TEST !== "owned") {
	test("strict pool policy uses isolated fake worker boundaries", () => {
		const cwd = mkdtempSync("/tmp/superset-strict-pool-");
		try {
			const result = spawnSync(
				process.execPath,
				["test", "--no-env-file", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_STRICT_POOL_TEST: "owned",
					},
					stdio: "pipe",
					timeout: 15000,
				},
			);
			if (result.stdout) process.stdout.write(result.stdout);
			if (result.stderr) process.stderr.write(result.stderr);
			if (result.error) throw result.error;
			expect(result.status).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
} else {
	globalThis.fetch = Object.assign(
		async () => {
			throw new Error("Unexpected strict pool network");
		},
		{ preconnect: () => {} },
	);
	let behavior: (
		worker: FakeWorker,
		message: { kind: string; taskId: string; payload: unknown },
	) => void;
	class FakeWorker extends EventEmitter {
		postMessage(message: { kind: string; taskId: string; payload: unknown }) {
			if (message.kind === "shutdown") {
				queueMicrotask(() => this.emit("exit", 0));
				return;
			}
			behavior(this, message);
		}
		async terminate() {
			this.emit("exit", 0);
			return 0;
		}
	}
	mock.module("node:worker_threads", () => ({ Worker: FakeWorker }));
	const { HostWorkerPool } = await import("./host-worker-pool");
	const { defineWorkerTask } = await import("./define-worker-task");
	const scope = (name: string) => `/owned/common/${name}`;
	const task = (key: string, handler: () => Promise<string>) =>
		defineWorkerTask({
			type: "test/strict",
			execution: "worker-only-nonreplay" as const,
			mutationScope: () => key,
			handler,
		});
	function reply(worker: FakeWorker, message: { taskId: string }, ok = true) {
		worker.emit(
			"message",
			ok
				? {
						kind: "result",
						taskId: message.taskId,
						ok,
						result: "worker-result",
					}
				: {
						kind: "result",
						taskId: message.taskId,
						ok,
						error: {
							name: "WorkerCrashedError",
							message: "ordinary reported command failure",
						},
					},
		);
	}
	test("strict missing bundle never invokes inline; default task still invokes inline", async () => {
		const pool = new HostWorkerPool({ scriptPathResolver: () => null });
		let executions = 0;
		const handler = async () => {
			executions++;
			return "inline";
		};
		try {
			await expect(
				pool.run(task(scope("missing"), handler), {}),
			).rejects.toThrow();
			expect(executions).toBe(0);
			expect(
				await pool.run(defineWorkerTask({ type: "test/default", handler }), {}),
			).toBe("inline");
			expect(executions).toBe(1);
		} finally {
			await pool.dispose();
		}
	});
	test("crash quarantines shared storage and rejects every already waiting lease", async () => {
		const pool = new HostWorkerPool({
			scriptPathResolver: () => "/fake/worker",
		});
		const key = scope("crash");
		const lease = await pool.acquireMutationScope(key);
		const waiter1 = pool.acquireMutationScope(key).then(
			() => "acquired",
			() => "quarantined",
		);
		const waiter2 = pool.acquireMutationScope(key).then(
			() => "acquired",
			() => "quarantined",
		);
		let executions = 0;
		behavior = (worker, message) => {
			if (message.kind === "task") {
				executions++;
				queueMicrotask(() => worker.emit("exit", 1));
			}
		};
		try {
			await expect(
				pool.run(
					task(key, async () => "forbidden-inline"),
					{},
				),
			).rejects.toThrow();
			expect(executions).toBe(1);
			expect(
				await Promise.race([
					Promise.all([waiter1, waiter2]),
					new Promise((resolve) => setTimeout(() => resolve("hung"), 100)),
				]),
			).toEqual(["quarantined", "quarantined"]);
			lease.release();
			await expect(pool.acquireMutationScope(key)).rejects.toThrow();
			await pool.dispose();
			const recreated = new HostWorkerPool({ scriptPathResolver: () => null });
			await expect(recreated.acquireMutationScope(key)).rejects.toThrow();
			await recreated.dispose();
		} finally {
			await pool.dispose();
		}
	});
	test("quarantine is visible before a queued same-storage command can dispatch", async () => {
		const pool = new HostWorkerPool({
			scriptPathResolver: () => "/fake/worker",
			concurrency: 1,
		});
		const key = scope("queued-dispatch");
		let executions = 0;
		behavior = (worker, message) => {
			if (message.kind === "task") {
				executions++;
				queueMicrotask(() => worker.emit("exit", 1));
			}
		};
		try {
			const outcomes = await Promise.allSettled([
				pool.run(
					task(key, async () => "forbidden-inline"),
					{},
				),
				pool.run(
					task(key, async () => "forbidden-inline"),
					{},
				),
			]);
			expect(outcomes.map((result) => result.status)).toEqual([
				"rejected",
				"rejected",
			]);
			expect(executions).toBe(1);
		} finally {
			await pool.dispose();
		}
	});
	test("task-reported failure cannot spoof an indeterminate transport error", async () => {
		const pool = new HostWorkerPool({
			scriptPathResolver: () => "/fake/worker",
		});
		const key = scope("reported");
		behavior = (worker, message) => {
			if (message.kind === "task")
				queueMicrotask(() => reply(worker, message, false));
		};
		try {
			await expect(
				pool.run(
					task(key, async () => "forbidden-inline"),
					{},
				),
			).rejects.toThrow("ordinary reported command failure");
			pool.assertMutationScopeHealthy(key);
			const lease = await pool.acquireMutationScope(key);
			lease.release();
		} finally {
			await pool.dispose();
		}
	});
	test("healthy FIFO release, queued cancellation and independent storage remain available", async () => {
		const pool = new HostWorkerPool({ scriptPathResolver: () => null });
		const key = scope("fifo"),
			order: string[] = [];
		const first = await pool.acquireMutationScope(key);
		const controller = new AbortController();
		const cancelled = pool.acquireMutationScope(key, controller.signal).then(
			() => "acquired",
			() => "cancelled",
		);
		const next = pool.acquireMutationScope(key).then((lease) => {
			order.push("next");
			return lease;
		});
		controller.abort();
		expect(await cancelled).toBe("cancelled");
		const independent = await pool.acquireMutationScope(scope("independent"));
		independent.release();
		expect(order).toEqual([]);
		first.release();
		(await next).release();
		expect(order).toEqual(["next"]);
		await pool.dispose();
	});
}
