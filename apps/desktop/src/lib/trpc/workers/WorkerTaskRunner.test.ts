import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

type WorkerBehavior =
	| "boot-fail"
	| "fail-on-task"
	| "mismatched-only"
	| "success";

let behaviors: WorkerBehavior[] = [];
let defaultBehavior: WorkerBehavior = "success";
const workers: MockWorker[] = [];

class MockWorker extends EventEmitter {
	public readonly id: number;
	private readonly behavior: WorkerBehavior;
	private terminated = false;

	constructor(_scriptPath: string) {
		super();
		this.id = workers.length + 1;
		this.behavior = behaviors.shift() ?? defaultBehavior;
		workers.push(this);

		if (this.behavior === "boot-fail") {
			queueMicrotask(() => {
				if (this.terminated) return;
				this.emit("error", new Error("Mock worker failed during boot"));
				this.emit("exit", 1);
			});
		}
	}

	postMessage(message: unknown): void {
		if (this.terminated) return;
		const taskId =
			typeof message === "object" &&
			message !== null &&
			"taskId" in message &&
			typeof message.taskId === "string"
				? message.taskId
				: "unknown";

		if (this.behavior === "fail-on-task") {
			queueMicrotask(() => {
				if (this.terminated) return;
				this.emit("error", new Error("Mock worker crashed while processing"));
				this.emit("exit", 1);
			});
			return;
		}

		if (this.behavior === "mismatched-only") {
			queueMicrotask(() => {
				if (this.terminated) return;
				this.emit("message", {
					kind: "result",
					taskId: `unexpected-${taskId}`,
					ok: true,
					result: { workerId: this.id },
				});
			});
			return;
		}

		queueMicrotask(() => {
			if (this.terminated) return;
			this.emit("message", {
				kind: "result",
				taskId,
				ok: true,
				result: { workerId: this.id },
			});
		});
	}

	terminate(): Promise<number> {
		if (this.terminated) return Promise.resolve(0);
		this.terminated = true;
		queueMicrotask(() => {
			this.emit("exit", 0);
		});
		return Promise.resolve(0);
	}
}

mock.module("node:worker_threads", () => ({
	Worker: MockWorker,
}));

const { WorkerTaskError, WorkerTaskRunner } = await import(
	"./WorkerTaskRunner"
);

const flushMicrotasks = async (times = 5): Promise<void> => {
	for (let i = 0; i < times; i++) {
		await Promise.resolve();
	}
};

describe("WorkerTaskRunner failure handling", () => {
	beforeEach(() => {
		behaviors = [];
		defaultBehavior = "success";
		workers.length = 0;
	});

	afterEach(async () => {
		for (const worker of workers) {
			await worker.terminate();
		}
	});

	test("does not respawn workers endlessly after boot failure when idle", async () => {
		defaultBehavior = "boot-fail";
		const runner = new WorkerTaskRunner({
			workerScriptPath: "/missing/worker-script.js",
			concurrency: 1,
		});

		const taskPromise = runner.runTask("status", {});
		await expect(taskPromise).rejects.toBeInstanceOf(WorkerTaskError);
		await flushMicrotasks(10);

		expect(workers.length).toBe(1);
		await runner.dispose();
	});

	test("respawns to keep processing when work is still queued", async () => {
		behaviors = ["fail-on-task", "success"];
		const runner = new WorkerTaskRunner({
			workerScriptPath: "/mock/worker.js",
			concurrency: 1,
		});

		const first = runner.runTask("status", { id: "first" });
		const second = runner.runTask<{ workerId: number }>("status", {
			id: "second",
		});

		await expect(first).rejects.toBeInstanceOf(WorkerTaskError);
		await expect(second).resolves.toEqual({ workerId: 2 });
		expect(workers.length).toBe(2);
		await runner.dispose();
	});

	test("ignores mismatched worker task results without freeing the slot", async () => {
		defaultBehavior = "mismatched-only";
		const runner = new WorkerTaskRunner({
			workerScriptPath: "/mock/worker.js",
			concurrency: 1,
		});

		const first = runner.runTask(
			"status",
			{ id: "first" },
			{ timeoutMs: 1_000 },
		);
		const second = runner.runTask(
			"status",
			{ id: "second" },
			{ timeoutMs: 1_000 },
		);
		await flushMicrotasks(10);

		const state = runner as unknown as {
			queue: string[];
			workerSlots: Map<number, { activeTaskId: string | null }>;
		};
		expect(state.queue.length).toBe(1);
		expect([...state.workerSlots.values()][0]?.activeTaskId).not.toBeNull();

		const firstSettled = first.then(
			() => "resolved" as const,
			() => "rejected" as const,
		);
		const secondSettled = second.then(
			() => "resolved" as const,
			() => "rejected" as const,
		);
		await runner.dispose();

		await expect(firstSettled).resolves.toBe("rejected");
		await expect(secondSettled).resolves.toBe("rejected");
	});
});
