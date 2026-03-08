/**
 * Tests for PostHog initialization — covers issue #2037
 *
 * Bug: when `*.posthog.com` is blocked at the DNS level, the Electron app
 * shows a blank screen.  The renderer `PostHogProvider` used to return `null`
 * while `isInitialized === false`, gating the entire React tree behind PostHog.
 * When DNS is blocked the SDK enters an aggressive retry loop, which either
 * keeps the CPU/network stack busy long enough to make Electron appear frozen,
 * or (in edge-cases) prolongs the blank-screen window.
 *
 * The fix is two-fold:
 *   1. `initPostHog` now swallows sync errors so callers are never thrown into
 *      an error state.
 *   2. `PostHogProvider` renders children immediately — the `isInitialized`
 *      gate has been removed so analytics can never block the UI.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

// ---------------------------------------------------------------------------
// Mocks — must be declared before the module-under-test is imported
// ---------------------------------------------------------------------------

const mockInit = mock((_key: string, _options: unknown) => {});
const mockCapture = mock((_event: string, _props?: unknown) => {});

mock.module("posthog-js/dist/module.full.no-external", () => ({
	default: {
		init: mockInit,
		capture: mockCapture,
		register: mock(() => {}),
		__loaded: false,
	},
}));

// Provide a key so the `if (!env.NEXT_PUBLIC_POSTHOG_KEY) return` branch is
// not taken in the main test cases.
mock.module("renderer/env.renderer", () => ({
	env: {
		NEXT_PUBLIC_POSTHOG_KEY: "phc_test_key",
		NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
		NODE_ENV: "test",
	},
}));

// Dynamic import *after* mocks are registered
const { initPostHog } = await import("./posthog");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("initPostHog", () => {
	beforeEach(() => {
		mockInit.mockReset();
		mockCapture.mockReset();
	});

	test("calls posthogFull.init with the configured key and host", () => {
		initPostHog();

		expect(mockInit).toHaveBeenCalledTimes(1);

		const [key, options] = mockInit.mock.calls[0] as [
			string,
			Record<string, unknown>,
		];
		expect(key).toBe("phc_test_key");
		expect(options).toMatchObject({
			api_host: "https://us.i.posthog.com",
		});
	});

	test("does not throw when posthog.init throws (e.g. DNS blocked causing sync error)", () => {
		// Simulate the SDK throwing during init — should NOT propagate
		mockInit.mockImplementation(() => {
			throw new Error("Failed to reach posthog.com");
		});

		// Before the fix `initPostHog` had no internal error handling, so the
		// error would propagate to PostHogProvider's try/catch, and the
		// `isInitialized` gate would still resolve (via `finally`).  But with
		// the gate removed we now want `initPostHog` itself to be safe to call
		// without any wrapping try/catch.
		expect(() => initPostHog()).not.toThrow();
	});

	test("logs an error and continues when posthog.init throws", () => {
		const consoleSpy = mock(() => {});
		const originalError = console.error;
		console.error = consoleSpy;

		mockInit.mockImplementation(() => {
			throw new Error("network error");
		});

		try {
			initPostHog();
		} finally {
			console.error = originalError;
		}

		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining("[posthog]"),
			expect.any(Error),
		);
	});
});

describe("initPostHog — no key configured", () => {
	test("skips initialisation when NEXT_PUBLIC_POSTHOG_KEY is absent", async () => {
		// Override the env mock to have no key
		mock.module("renderer/env.renderer", () => ({
			env: {
				NEXT_PUBLIC_POSTHOG_KEY: undefined,
				NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
				NODE_ENV: "test",
			},
		}));

		// Re-import the module so it picks up the updated env mock
		const { initPostHog: initNoKey } = await import("./posthog");

		mockInit.mockReset();
		initNoKey();

		expect(mockInit).not.toHaveBeenCalled();
	});
});
