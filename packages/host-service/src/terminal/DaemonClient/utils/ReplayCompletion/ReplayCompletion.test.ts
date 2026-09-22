import { expect, test } from "bun:test";
import { ReplayCompletion } from "./ReplayCompletion.ts";

test("a completed replay cannot fail after its timeout or a later disconnect", async () => {
	const replay = new ReplayCompletion(5, new Error("timeout"));
	replay.resolve();
	await replay.promise;
	await Bun.sleep(10);
	replay.reject(new Error("disconnect"));
	expect(replay.status).toBe("ready");
	await replay.promise;
});

test("a timed out replay stays failed even if a late checkpoint arrives", async () => {
	const timeout = new Error("timeout");
	const replay = new ReplayCompletion(5, timeout);
	await expect(replay.promise).rejects.toBe(timeout);
	replay.resolve();
	expect(replay.status).toBe("failed");
	await expect(replay.promise).rejects.toBe(timeout);
});

test("failure preserves the original reason and a fresh replay can succeed", async () => {
	const failure = new Error("invalid checkpoint");
	const replay = new ReplayCompletion(5, new Error("timeout"));
	replay.reject(failure);
	replay.reject(new Error("disconnect"));
	await Bun.sleep(10);
	await expect(replay.promise).rejects.toBe(failure);
	expect(replay.status).toBe("failed");
	const replacement = new ReplayCompletion(5, new Error("timeout"));
	replacement.resolve();
	await replacement.promise;
	expect(replacement.status).toBe("ready");
});
