import { describe, expect, mock, test } from "bun:test";

// Mock posthog and outlit before importing analytics
mock.module("renderer/lib/posthog", () => ({
	posthog: {
		capture: mock(() => {}),
	},
}));

mock.module("renderer/lib/outlit", () => ({
	outlit: {
		track: mock(() => {}),
	},
}));

mock.module("shared/analytics", () => ({
	toOutlitProperties: (props: unknown) => props,
}));

const { track, setTelemetryEnabled, isTelemetryEnabled } = await import(
	"./index"
);
const { posthog } = await import("renderer/lib/posthog");
const { outlit } = await import("renderer/lib/outlit");

describe("renderer analytics", () => {
	test("telemetry is disabled by default", () => {
		expect(isTelemetryEnabled()).toBe(false);
	});

	test("track() does not send events when telemetry is disabled", () => {
		setTelemetryEnabled(false);
		track("test_event", { key: "value" });

		expect(posthog.capture).not.toHaveBeenCalled();
		expect(outlit.track).not.toHaveBeenCalled();
	});

	test("track() sends events when telemetry is enabled", () => {
		setTelemetryEnabled(true);
		track("test_event", { key: "value" });

		expect(posthog.capture).toHaveBeenCalledWith("test_event", {
			key: "value",
		});
		expect(outlit.track).toHaveBeenCalled();
	});

	test("track() stops sending after telemetry is disabled again", () => {
		setTelemetryEnabled(true);
		setTelemetryEnabled(false);

		const callsBefore = (posthog.capture as ReturnType<typeof mock>).mock.calls
			.length;
		track("should_not_send");

		expect((posthog.capture as ReturnType<typeof mock>).mock.calls.length).toBe(
			callsBefore,
		);
	});
});
