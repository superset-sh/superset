import { describe, expect, it } from "bun:test";
import { TERMINAL_ATTACH_CANCELED_MESSAGE } from "../errors";
import { PrioritySemaphore } from "./priority-semaphore";

describe("PrioritySemaphore", () => {
	it("drops aborted waiters without blocking later acquires", async () => {
		const semaphore = new PrioritySemaphore(1);
		const releaseFirst = await semaphore.acquire(1);
		const aborted = new AbortController();
		const waiting = new AbortController();

		const abortedAcquire = semaphore.acquire(1, aborted.signal);
		const waitingAcquire = semaphore.acquire(1, waiting.signal);

		aborted.abort();

		await expect(abortedAcquire).rejects.toThrow(
			TERMINAL_ATTACH_CANCELED_MESSAGE,
		);

		releaseFirst();

		const releaseSecond = await waitingAcquire;
		expect(typeof releaseSecond).toBe("function");
		releaseSecond();
	});
});
