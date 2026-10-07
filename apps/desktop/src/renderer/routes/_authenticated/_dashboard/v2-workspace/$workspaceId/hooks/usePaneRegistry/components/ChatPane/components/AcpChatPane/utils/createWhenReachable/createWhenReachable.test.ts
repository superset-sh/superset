import { describe, expect, test } from "bun:test";
import { createWhenReachable, type Wait } from "./createWhenReachable";

const immediate: Wait = (callback, delayMs) => {
	if (delayMs < 15_000) queueMicrotask(callback);
	return () => {};
};

describe("createWhenReachable", () => {
	test("retries while the host is unreachable, then returns", async () => {
		let calls = 0;
		const states: boolean[] = [];
		const result = await createWhenReachable({
			attempt: async () => {
				calls += 1;
				if (calls < 3) throw new TypeError("fetch failed");
				return "session-1";
			},
			isReachableFailure: () => false,
			shouldContinue: () => true,
			onUnreachable: (unreachable) => states.push(unreachable),
			wait: immediate,
		});
		expect(result).toBe("session-1");
		expect(calls).toBe(3);
		expect(states).toEqual([true, true, false]);
	});

	test("gives up at once on an error the host answered with", async () => {
		let calls = 0;
		const answered = new Error("unknown harness");
		await expect(
			createWhenReachable({
				attempt: async () => {
					calls += 1;
					throw answered;
				},
				isReachableFailure: (error) => error === answered,
				shouldContinue: () => true,
				onUnreachable: () => {},
				wait: immediate,
			}),
		).rejects.toBe(answered);
		expect(calls).toBe(1);
	});

	test("stops retrying once nothing is waiting for the session", async () => {
		let calls = 0;
		await expect(
			createWhenReachable({
				attempt: async () => {
					calls += 1;
					throw new TypeError("fetch failed");
				},
				isReachableFailure: () => false,
				shouldContinue: () => calls < 2,
				onUnreachable: () => {},
				wait: immediate,
			}),
		).rejects.toThrow("fetch failed");
		expect(calls).toBe(2);
	});
});
