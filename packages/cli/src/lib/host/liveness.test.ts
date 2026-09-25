import { expect, test } from "bun:test";
import { waitForUnresponsiveHost } from "./liveness";

function watch(results: boolean[], signal = new AbortController().signal) {
	let calls = 0;
	const outcome = waitForUnresponsiveHost({
		endpoint: "http://127.0.0.1:1",
		authToken: "secret",
		signal,
		intervalMs: 1,
		failureThreshold: 3,
		check: async () => ({ healthy: results[calls++] ?? false }),
	});
	return { outcome, calls: () => calls };
}

test("reports a host that fails every check in a row", async () => {
	const { outcome, calls } = watch([true, false, false, false]);
	expect(await outcome).toBe(true);
	expect(calls()).toBe(4);
});

test("a healthy check in between resets the count", async () => {
	const { outcome, calls } = watch([false, false, true, false, false, false]);
	expect(await outcome).toBe(true);
	expect(calls()).toBe(6);
});

test("stops without reporting when the command is aborted", async () => {
	const controller = new AbortController();
	const { outcome } = watch(
		Array.from({ length: 1_000 }, () => true),
		controller.signal,
	);
	setTimeout(() => controller.abort(), 20);
	expect(await outcome).toBe(false);
});
