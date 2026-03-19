import { describe, expect, mock, test } from "bun:test";

// Mock electron
mock.module("electron", () => ({
	app: { getVersion: () => "1.0.0" },
}));

// Mock posthog-node
mock.module("posthog-node", () => ({
	PostHog: class {
		capture = mock(() => {});
	},
}));

// Mock outlit
mock.module("main/lib/outlit", () => ({
	outlit: {
		track: mock(() => {}),
		user: { activate: mock(() => {}) },
	},
}));

// Mock env with no PostHog key (so PostHog client won't initialize)
mock.module("main/env.main", () => ({
	env: {
		NEXT_PUBLIC_POSTHOG_KEY: undefined,
		NEXT_PUBLIC_POSTHOG_HOST: undefined,
	},
}));

mock.module("shared/analytics", () => ({
	toOutlitProperties: (props: unknown) => props,
}));

describe("main process analytics", () => {
	test("isTelemetryEnabled returns DEFAULT_TELEMETRY_ENABLED (false)", async () => {
		const { DEFAULT_TELEMETRY_ENABLED } = await import("shared/constants");
		expect(DEFAULT_TELEMETRY_ENABLED).toBe(false);
	});

	test("track() does not send events when telemetry is disabled (default)", async () => {
		const { track, setUserId } = await import("./index");
		const { outlit } = await import("main/lib/outlit");

		setUserId("test-user");
		track("test_event", { key: "value" });

		// DEFAULT_TELEMETRY_ENABLED is false, so outlit.track should not be called
		expect(outlit.track).not.toHaveBeenCalled();
	});
});
