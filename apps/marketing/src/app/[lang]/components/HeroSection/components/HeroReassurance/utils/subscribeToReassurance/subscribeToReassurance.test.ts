import { describe, expect, mock, test } from "bun:test";
import type { PostHog } from "posthog-js";
import {
	HERO_REASSURANCE_FLAG,
	type ReassuranceAssignment,
	subscribeToReassurance,
} from "./subscribeToReassurance";

function harness() {
	let notify: Parameters<PostHog["onFeatureFlags"]>[0] = () => {};
	let flag: string | boolean | undefined;
	let optedOut = false;
	let assignment: ReassuranceAssignment | undefined;
	const capture = mock(() => undefined);
	const unsubscribe = mock(() => {});
	const getFeatureFlag = mock(() => flag);
	const stop = subscribeToReassurance(
		{
			capture,
			getFeatureFlag,
			has_opted_out_capturing: () => optedOut,
			onFeatureFlags: (callback) => {
				notify = callback;
				return unsubscribe;
			},
		},
		(value) => {
			assignment = value;
		},
	);
	return {
		capture,
		unsubscribe,
		getFeatureFlag,
		stop,
		get assignment() {
			return assignment;
		},
		optOut: () => {
			optedOut = true;
		},
		resolve: (value: typeof flag, errorsLoading = false) => {
			flag = value;
			notify([], {}, { errorsLoading });
		},
	};
}

describe("hero reassurance experiment", () => {
	test.each([
		"control",
		"test",
	])("records %s only after the rendered arm is seen", (variant) => {
		const h = harness();
		h.resolve(variant);
		expect(h.assignment?.variant).toBe(variant);
		expect(h.getFeatureFlag).toHaveBeenCalledWith(HERO_REASSURANCE_FLAG, {
			send_event: false,
		});
		expect(h.capture).not.toHaveBeenCalled();
		h.assignment?.recordExposure();
		h.assignment?.recordExposure();
		expect(h.capture).toHaveBeenCalledTimes(1);
		expect(h.capture).toHaveBeenCalledWith("$feature_flag_called", {
			$feature_flag: HERO_REASSURANCE_FLAG,
			$feature_flag_response: variant,
			[`$feature/${HERO_REASSURANCE_FLAG}`]: variant,
			experiment_surface: "marketing_hero",
		});
	});

	test("unloaded, disabled, unexpected and failed flags do not enroll", () => {
		const h = harness();
		for (const value of [undefined, false, true, "unexpected"])
			h.resolve(value);
		h.resolve("test", true);
		expect(h.assignment).toBeUndefined();
		expect(h.capture).not.toHaveBeenCalled();
		h.resolve("test");
		expect(h.assignment?.variant).toBe("test");
	});

	test("a refresh cannot switch the rendered arm or mislabel its exposure", () => {
		const h = harness();
		h.resolve("control");
		h.resolve("test");
		expect(h.assignment?.variant).toBe("control");
		h.assignment?.recordExposure();
		expect(h.capture.mock.calls).toHaveLength(1);
	});

	test("opted-out visitors are not enrolled", () => {
		const h = harness();
		h.optOut();
		h.resolve("test");
		expect(h.assignment).toBeUndefined();
	});

	test("opting out after assignment suppresses exposure", () => {
		const h = harness();
		h.resolve("test");
		h.optOut();
		h.assignment?.recordExposure();
		expect(h.capture).not.toHaveBeenCalled();
	});

	test("unmount cancels callbacks and pending exposure", () => {
		const h = harness();
		h.resolve("control");
		h.stop();
		h.resolve("test");
		h.assignment?.recordExposure();
		expect(h.unsubscribe).toHaveBeenCalledTimes(1);
		expect(h.capture).not.toHaveBeenCalled();
	});
});
