import { describe, expect, test } from "bun:test";
import type { HostServiceContext } from "../types";
import { defineWorkerTask } from "../workers/define-worker-task";
import { HostWorkerPool } from "../workers/host-worker-pool";
import { createOffLoop } from "./off-loop";

const echoTask = defineWorkerTask<{ value: string }, string>({
	type: "test/echo",
	handler: async ({ value }) => `echoed:${value}`,
});

const fakeCtx = { isAuthenticated: true } as unknown as HostServiceContext;

describe("offLoop", () => {
	test("prepare output becomes the task input; result flows back", async () => {
		const calls: Array<{ type: string; input: unknown }> = [];
		const offLoop = createOffLoop(() => ({
			run: async (def, input) => {
				calls.push({ type: def.type, input });
				return def.handler(input);
			},
		}));

		const resolver = offLoop({
			task: echoTask,
			prepare: ({ input }: { input: { name: string } }) => ({
				value: input.name.toUpperCase(),
			}),
		});

		const result = await resolver({ ctx: fakeCtx, input: { name: "kiet" } });
		expect(result).toBe("echoed:KIET");
		expect(calls).toEqual([{ type: "test/echo", input: { value: "KIET" } }]);
	});

	test("forwards the caller's abort signal and merges options", async () => {
		let seenOptions: unknown;
		const offLoop = createOffLoop(() => ({
			run: async (def, input, options) => {
				seenOptions = options;
				return def.handler(input);
			},
		}));

		const controller = new AbortController();
		const resolver = offLoop({
			task: echoTask,
			prepare: () => ({ value: "x" }),
			options: () => ({ strategy: "coalesce", dedupeKey: "k" }),
		});

		await resolver({
			ctx: fakeCtx,
			input: undefined,
			signal: controller.signal,
		});
		expect(seenOptions).toEqual({
			strategy: "coalesce",
			dedupeKey: "k",
			signal: controller.signal,
		});
	});

	test("runs the task through a real pool (inline mode)", async () => {
		const pool = new HostWorkerPool({ scriptPathResolver: () => null });
		const offLoop = createOffLoop(() => pool);
		const resolver = offLoop({
			task: echoTask,
			prepare: () => ({ value: "pooled" }),
		});
		expect(await resolver({ ctx: fakeCtx, input: undefined })).toBe(
			"echoed:pooled",
		);
		await pool.dispose();
	});

	test("prepare errors reject the call without reaching the pool", async () => {
		let ran = false;
		const offLoop = createOffLoop(() => ({
			run: async (def, input) => {
				ran = true;
				return def.handler(input);
			},
		}));
		const resolver = offLoop({
			task: echoTask,
			prepare: () => {
				throw new Error("prepare failed");
			},
		});
		await expect(resolver({ ctx: fakeCtx, input: undefined })).rejects.toThrow(
			"prepare failed",
		);
		expect(ran).toBe(false);
	});
});
