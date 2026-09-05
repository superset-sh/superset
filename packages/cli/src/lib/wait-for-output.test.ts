import { describe, expect, it } from "bun:test";
import {
	WaitForOutputTimeoutError,
	waitForOutputMatch,
} from "./wait-for-output";

function fakeClock(startAt = 0) {
	let current = startAt;
	return {
		now: () => current,
		advance: (ms: number) => {
			current += ms;
		},
	};
}

describe("waitForOutputMatch", () => {
	it("resolves immediately when the text already matches, without sleeping", async () => {
		const sleeps: number[] = [];
		const result = await waitForOutputMatch(
			{
				readText: () => Promise.resolve("build passed: 12 tests"),
				sleep: (ms) => {
					sleeps.push(ms);
					return Promise.resolve();
				},
			},
			{ regex: /passed|failed/, timeoutMs: 10_000, pollIntervalMs: 500 },
		);

		expect(result).toEqual({ text: "build passed: 12 tests", match: "passed" });
		expect(sleeps).toEqual([]);
	});

	it("polls until a later read matches", async () => {
		const reads = ["waiting...", "still waiting...", "done: passed"];
		let i = 0;
		const sleeps: number[] = [];

		const result = await waitForOutputMatch(
			{
				readText: () => Promise.resolve(reads[i++] as string),
				sleep: (ms) => {
					sleeps.push(ms);
					return Promise.resolve();
				},
			},
			{ regex: /passed|failed/, timeoutMs: 10_000, pollIntervalMs: 250 },
		);

		expect(result).toEqual({ text: "done: passed", match: "passed" });
		expect(sleeps).toEqual([250, 250]);
	});

	it("throws WaitForOutputTimeoutError once the deadline passes without a match", async () => {
		const clock = fakeClock();
		await expect(
			waitForOutputMatch(
				{
					readText: () => Promise.resolve("nothing here"),
					sleep: (ms) => {
						clock.advance(ms);
						return Promise.resolve();
					},
					now: clock.now,
				},
				{ regex: /passed|failed/, timeoutMs: 1_000, pollIntervalMs: 300 },
			),
		).rejects.toThrow(WaitForOutputTimeoutError);
	});

	it("caps the final poll interval to exactly what's left before the deadline", async () => {
		const clock = fakeClock();
		const sleeps: number[] = [];
		let reads = 0;

		await expect(
			waitForOutputMatch(
				{
					readText: () => {
						reads++;
						return Promise.resolve("nope");
					},
					sleep: (ms) => {
						sleeps.push(ms);
						clock.advance(ms);
						return Promise.resolve();
					},
					now: clock.now,
				},
				{ regex: /xyz/, timeoutMs: 1_000, pollIntervalMs: 400 },
			),
		).rejects.toThrow(WaitForOutputTimeoutError);

		// 400, 400, then only 200 left before the 1000ms deadline; one final
		// read at the deadline is what discovers there's no time left to retry.
		expect(sleeps).toEqual([400, 400, 200]);
		expect(reads).toBe(4);
	});

	it("propagates a readText failure instead of retrying silently", async () => {
		await expect(
			waitForOutputMatch(
				{
					readText: () => Promise.reject(new Error("host unreachable")),
					sleep: () => Promise.resolve(),
				},
				{ regex: /x/, timeoutMs: 1_000, pollIntervalMs: 100 },
			),
		).rejects.toThrow("host unreachable");
	});
});
