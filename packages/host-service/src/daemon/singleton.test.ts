// Tests for the daemon supervisor singleton + bootstrap helpers.
// We don't spawn a real daemon here — the singleton is just plumbing
// (DI for the supervisor, fire-and-track promise stash). Real-spawn
// coverage lives in DaemonSupervisor.node-test.ts.

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { DaemonSupervisor } from "./DaemonSupervisor.ts";
import {
	__resetSupervisorForTesting,
	getSupervisor,
	startDaemonBootstrap,
	waitForDaemonReady,
} from "./singleton.ts";

beforeEach(() => {
	__resetSupervisorForTesting();
});

afterEach(() => {
	__resetSupervisorForTesting();
});

describe("getSupervisor", () => {
	test("returns the same instance across calls", () => {
		const a = getSupervisor("/nonexistent");
		const b = getSupervisor("/different");
		// Singleton — second arg is ignored after first construction.
		expect(b).toBe(a);
	});

	test("constructs with the provided scriptPath on first call", () => {
		const sup = getSupervisor("/some/path/pty-daemon.js");
		// We can't read scriptPath via public API, but we can confirm the
		// supervisor was constructed (not null) and uses the path when it
		// tries to spawn — `existsSync` check throws "script not found".
		expect(sup).toBeInstanceOf(DaemonSupervisor);
	});
});

describe("fire-and-track bootstrap", () => {
	test("startDaemonBootstrap kicks off ensure without awaiting", async () => {
		const sup = getSupervisor("/nonexistent");
		const ensureMock = mock(async () => {
			// Long-running ensure that we control via a manual settle.
			await new Promise((r) => setTimeout(r, 50));
			return {} as Awaited<ReturnType<typeof sup.ensure>>;
		});
		(sup as unknown as { ensure: typeof sup.ensure }).ensure =
			ensureMock as typeof sup.ensure;

		const t0 = Date.now();
		startDaemonBootstrap("org-fnt");
		const elapsed = Date.now() - t0;
		// Should return immediately, not after the ensure delay.
		expect(elapsed).toBeLessThan(20);
		expect(ensureMock).toHaveBeenCalledTimes(1);
		expect(ensureMock).toHaveBeenCalledWith("org-fnt");

		// Now await readiness — should complete after ensure resolves.
		await waitForDaemonReady("org-fnt");
		// Sanity: ensure was invoked exactly once across both calls.
		expect(ensureMock).toHaveBeenCalledTimes(1);
	});

	test("startDaemonBootstrap is idempotent", () => {
		const sup = getSupervisor("/nonexistent");
		const ensureMock = mock(async () => {
			await new Promise((r) => setTimeout(r, 100));
			return {} as Awaited<ReturnType<typeof sup.ensure>>;
		});
		(sup as unknown as { ensure: typeof sup.ensure }).ensure =
			ensureMock as typeof sup.ensure;

		startDaemonBootstrap("org-idempotent");
		startDaemonBootstrap("org-idempotent");
		startDaemonBootstrap("org-idempotent");
		expect(ensureMock).toHaveBeenCalledTimes(1);
	});

	test("waitForDaemonReady kicks off bootstrap if none in flight", async () => {
		const sup = getSupervisor("/nonexistent");
		const ensureMock = mock(async () => {
			return {} as Awaited<ReturnType<typeof sup.ensure>>;
		});
		(sup as unknown as { ensure: typeof sup.ensure }).ensure =
			ensureMock as typeof sup.ensure;

		await waitForDaemonReady("org-lazy");
		expect(ensureMock).toHaveBeenCalledTimes(1);
	});

	test("a failed bootstrap is retryable", async () => {
		const sup = getSupervisor("/nonexistent");
		let failNext = true;
		const ensureMock = mock(async () => {
			if (failNext) {
				failNext = false;
				throw new Error("simulated spawn failure");
			}
			return {} as Awaited<ReturnType<typeof sup.ensure>>;
		});
		(sup as unknown as { ensure: typeof sup.ensure }).ensure =
			ensureMock as typeof sup.ensure;

		// First wait surfaces the failure.
		await expect(waitForDaemonReady("org-retry")).rejects.toThrow(
			"simulated spawn failure",
		);
		// Second wait kicks off a new bootstrap (the failed promise was
		// cleared) and succeeds.
		await waitForDaemonReady("org-retry");
		expect(ensureMock).toHaveBeenCalledTimes(2);
	});
});
