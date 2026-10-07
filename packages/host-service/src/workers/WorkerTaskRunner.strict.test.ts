import { expect, mock, spyOn, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";

if (process.env.SUPERSET_STRICT_RUNNER_TEST !== "owned") {
	test("strict terminal provenance runs in an isolated fake child", () => {
		const cwd = mkdtempSync("/tmp/superset-strict-runner-");
		try {
			const child = spawnSync(
				process.execPath,
				["test", "--no-env-file", import.meta.path],
				{
					cwd,
					env: {
						PATH: process.env.PATH,
						TMPDIR: "/tmp",
						SUPERSET_STRICT_RUNNER_TEST: "owned",
					},
					stdio: "pipe",
					timeout: 15000,
				},
			);
			if (child.stdout) process.stdout.write(child.stdout);
			if (child.stderr) process.stderr.write(child.stderr);
			if (child.error) throw child.error;
			expect(child.status).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
} else {
	globalThis.fetch = Object.assign(
		async () => {
			throw new Error("Unexpected strict runner network");
		},
		{ preconnect: () => {} },
	);
	let onTask: (
		worker: FakeWorker,
		message: { taskId: string; payload?: { label?: string } },
	) => void;
	let constructorRefusal = false;
	class FakeWorker extends EventEmitter {
		constructor() {
			super();
			if (constructorRefusal) {
				constructorRefusal = false;
				throw new Error("owned never-started constructor refusal");
			}
		}
		postMessage(message: {
			kind: string;
			taskId: string;
			payload?: { label?: string };
		}) {
			if (message.kind === "shutdown") {
				queueMicrotask(() => this.emit("exit", 0));
				return;
			}
			onTask(this, message);
		}
		async terminate() {
			this.emit("exit", 0);
			return 0;
		}
	}
	mock.module("node:worker_threads", () => ({ Worker: FakeWorker }));
	const module = await import("./WorkerTaskRunner");
	const make = () =>
		new module.WorkerTaskRunner({
			workerScriptPath: "/fake/worker",
			concurrency: 1,
		});
	const strict = { quarantineDispatchedFailures: true };
	test("strict constructor refusal cleans up abandoned queue and signal before later admission", async () => {
		const { HostWorkerPool } = await import("./host-worker-pool");
		const { defineWorkerTask } = await import("./define-worker-task");
		const scope = "/owned/strict-constructor-refusal",
			dispatched: string[] = [];
		const task = defineWorkerTask({
			type: "owned/strict-spawn-refusal",
			execution: "worker-only-nonreplay",
			mutationScope: () => scope,
			handler: async (_input: { label: string }): Promise<string> => {
				throw new Error("Inline forbidden");
			},
		});
		const pool = new HostWorkerPool({
			scriptPathResolver: () => "/fake/worker",
			concurrency: 1,
		});
		const lease = await pool.acquireMutationScope(scope),
			controller = new AbortController();
		const removeListener = spyOn(controller.signal, "removeEventListener");
		onTask = (worker, message) => {
			dispatched.push(message.payload?.label ?? "missing");
			queueMicrotask(() =>
				worker.emit("message", {
					kind: "result",
					taskId: message.taskId,
					ok: true,
					result: message.payload?.label,
				}),
			);
		};
		constructorRefusal = true;
		try {
			await expect(
				pool.run(task, { label: "abandoned-A" }, { signal: controller.signal }),
			).rejects.toThrow("owned never-started constructor refusal");
			expect(dispatched).toEqual([]);
			expect(removeListener).toHaveBeenCalledTimes(1);
			pool.assertMutationScopeHealthy(scope);
			lease.release();
			const later = await pool.acquireMutationScope(scope);
			try {
				expect(await pool.run(task, { label: "new-B" })).toBe("new-B");
				expect(dispatched).toEqual(["new-B"]);
				controller.abort();
				pool.assertMutationScopeHealthy(scope);
			} finally {
				later.release();
			}
		} finally {
			constructorRefusal = false;
			removeListener.mockRestore();
			lease.release();
			await pool.dispose();
		}
	});
	async function failure(promise: Promise<unknown>) {
		return promise.then(
			() => null,
			(error: unknown) => error,
		);
	}
	for (const mixed of [false, true])
		test(`capacity refusal during a worker exit cleans ${mixed ? "mixed" : "strict"} queue without an escaping event error`, async () => {
			const runner = make();
			let active: FakeWorker | undefined;
			const labels: string[] = [];
			onTask = (worker, message) => {
				active = worker;
				labels.push(message.payload?.label ?? "missing");
			};
			const first = failure(
				runner.runTask("owned", { label: "first" }, strict),
			);
			const queued = failure(
				runner.runTask("owned", { label: "never-started" }, strict),
			);
			const legacy = mixed
				? failure(runner.runTask("owned", { label: "abandoned-legacy" }))
				: undefined;
			constructorRefusal = true;
			let escaped: unknown;
			try {
				try {
					active?.emit("exit", 1);
				} catch (error) {
					escaped = error;
				}
				const outcome = await Promise.race([
					queued,
					new Promise((resolve) => setTimeout(() => resolve("stranded"), 20)),
				]);
				expect(escaped).toBeUndefined();
				expect(outcome).toBeInstanceOf(Error);
				expect(outcome instanceof Error && outcome.message).toBe(
					"owned never-started constructor refusal",
				);
				expect(outcome).not.toBeInstanceOf(module.WorkerTaskIndeterminateError);
				expect(await first).toBeInstanceOf(module.WorkerTaskIndeterminateError);
				if (legacy) {
					const rejectedLegacy = await legacy;
					expect(
						rejectedLegacy instanceof Error && rejectedLegacy.message,
					).toBe("owned never-started constructor refusal");
				}
				onTask = (worker, message) => {
					labels.push(message.payload?.label ?? "missing");
					queueMicrotask(() =>
						worker.emit("message", {
							kind: "result",
							taskId: message.taskId,
							ok: true,
							result: "later",
						}),
					);
				};
				expect(
					await runner.runTask<string>("owned", { label: "later" }, strict),
				).toBe("later");
				expect(labels).toEqual(["first", "later"]);
			} finally {
				constructorRefusal = false;
				await runner.dispose();
			}
		});
	for (const event of [
		"timeout",
		"abort",
		"crash",
		"transport",
		"dispose",
	] as const) {
		test(`dispatched ${event} is typed indeterminate before caller cleanup`, async () => {
			const runner = make(),
				controller = new AbortController();
			onTask = (w) => {
				if (event === "crash") queueMicrotask(() => w.emit("exit", 1));
				if (event === "transport") throw new Error("owned post failure");
			};
			const pending = failure(
				runner.runTask(
					"owned",
					{},
					{
						...strict,
						signal: controller.signal,
						timeoutMs: event === "timeout" ? 5 : 1000,
					},
				),
			);
			if (event === "abort") controller.abort();
			if (event === "dispose") await runner.dispose();
			try {
				const error = await pending;
				expect(error).toBeInstanceOf(module.WorkerTaskIndeterminateError);
				expect(error instanceof Error && error.cause instanceof Error).toBe(
					true,
				);
			} finally {
				await runner.dispose();
			}
		});
	}
	test("preabort and failed clone are never-started rather than indeterminate", async () => {
		const runner = make(),
			controller = new AbortController();
		controller.abort();
		let tasks = 0;
		onTask = () => {
			tasks++;
		};
		try {
			const aborted = await failure(
				runner.runTask("owned", {}, { ...strict, signal: controller.signal }),
			);
			const clone = await failure(
				runner.runTask(
					"owned",
					{ callback: () => {} },
					{ ...strict, timeoutMs: 5 },
				),
			);
			expect(aborted).not.toBeInstanceOf(module.WorkerTaskIndeterminateError);
			expect(clone).not.toBeInstanceOf(module.WorkerTaskIndeterminateError);
			expect(tasks).toBe(0);
		} finally {
			await runner.dispose();
		}
	});
	test("reported worker command error remains ordinary even with a spoofed infrastructure name", async () => {
		const runner = make();
		onTask = (w, message) =>
			queueMicrotask(() =>
				w.emit("message", {
					kind: "result",
					taskId: message.taskId,
					ok: false,
					error: {
						name: "WorkerTaskIndeterminateError",
						message: "reported Git refusal",
					},
				}),
			);
		try {
			const error = await failure(runner.runTask("owned", {}, strict));
			expect(error).toBeInstanceOf(module.WorkerTaskError);
			expect(error).not.toBeInstanceOf(module.WorkerTaskIndeterminateError);
		} finally {
			await runner.dispose();
		}
	});
	test("unmarked abort preserves original error class and terminal behavior", async () => {
		const runner = make(),
			controller = new AbortController();
		onTask = () => {};
		const pending = failure(
			runner.runTask("owned", {}, { signal: controller.signal }),
		);
		controller.abort();
		try {
			expect(await pending).toBeInstanceOf(module.WorkerTaskAbortedError);
		} finally {
			await runner.dispose();
		}
	});
}
