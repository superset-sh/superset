import { describe, expect, it, mock } from "bun:test";
import {
	isTransientNetworkError,
	withNetworkRetry,
} from "./create-session-retry";

// A renderer fetch failure, as tRPC surfaces it: a top-level error whose
// message is the original "Failed to fetch" (the exact text shown in #5699).
function fetchFailure(port = 48135): Error {
	const cause = new TypeError("Failed to fetch");
	return new Error(`Failed to fetch (127.0.0.1:${port})`, { cause });
}

describe("isTransientNetworkError", () => {
	it("flags renderer fetch failures", () => {
		expect(isTransientNetworkError(fetchFailure())).toBe(true);
		expect(isTransientNetworkError(new TypeError("Failed to fetch"))).toBe(
			true,
		);
		expect(isTransientNetworkError(new Error("Load failed"))).toBe(true);
		expect(isTransientNetworkError(new Error("connect ECONNREFUSED"))).toBe(
			true,
		);
	});

	it("does not flag server-side errors", () => {
		expect(isTransientNetworkError(new Error("Invalid input"))).toBe(false);
		expect(
			isTransientNetworkError(new Error("Terminal session creation failed.")),
		).toBe(false);
	});
});

describe("withNetworkRetry", () => {
	// Reproduces #5699: the terminal-create path calls `createSession.mutate`
	// directly with no retry, so a single transient "Failed to fetch" — the
	// service momentarily unreachable — aborts the whole preset run. This is the
	// behavior a caller sees today (attempts: 1 == no retry).
	it("surfaces a transient failure when not retried (reproduces the bug)", async () => {
		const createSession = mock(async () => {
			throw fetchFailure();
		});

		await expect(
			withNetworkRetry(createSession, { attempts: 1 }),
		).rejects.toThrow("Failed to fetch");
		expect(createSession).toHaveBeenCalledTimes(1);
	});

	// The fix: retry the idempotent createSession call through a transient blip.
	it("recovers when a transient failure is followed by success", async () => {
		let calls = 0;
		const createSession = mock(async () => {
			calls += 1;
			if (calls < 2) throw fetchFailure();
			return { terminalId: "term-1", status: "active" as const };
		});

		const result = await withNetworkRetry(createSession, {
			attempts: 3,
			delayMs: 0,
			sleep: async () => {},
		});

		expect(result.terminalId).toBe("term-1");
		expect(createSession).toHaveBeenCalledTimes(2);
	});

	it("gives up after exhausting attempts", async () => {
		const createSession = mock(async () => {
			throw fetchFailure();
		});

		await expect(
			withNetworkRetry(createSession, {
				attempts: 3,
				delayMs: 0,
				sleep: async () => {},
			}),
		).rejects.toThrow("Failed to fetch");
		expect(createSession).toHaveBeenCalledTimes(3);
	});

	it("does not retry non-network errors", async () => {
		const createSession = mock(async () => {
			throw new Error("Invalid input");
		});

		await expect(
			withNetworkRetry(createSession, {
				attempts: 3,
				delayMs: 0,
				sleep: async () => {},
			}),
		).rejects.toThrow("Invalid input");
		expect(createSession).toHaveBeenCalledTimes(1);
	});
});
