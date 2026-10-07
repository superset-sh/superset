import { expect, test } from "bun:test";
import { defineWorkerTask } from "./define-worker-task";

test("strict worker definitions require a mutation scope", () => {
	const strict = defineWorkerTask({
		type: "fixture/write",
		execution: "worker-only-nonreplay",
		mutationScope: (input: string) => input,
		handler: async (input: string) => input,
	});
	expect(strict.mutationScope?.("repo")).toBe("repo");
	const normal = defineWorkerTask({
		type: "fixture/read",
		handler: async () => "read",
	});
	expect(normal.execution).toBeUndefined();
	// @ts-expect-error Strict mutations cannot omit their scope.
	defineWorkerTask({
		type: "fixture/invalid",
		execution: "worker-only-nonreplay",
		handler: async () => "write",
	});
});
