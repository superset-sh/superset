import { describe, expect, mock, test } from "bun:test";
import type { PostHog } from "posthog-js";
import {
	HERO_HEADLINE_FLAG,
	type HeadlineAssignment,
	subscribeToHeadlineVariant,
} from "./subscribeToHeadlineVariant";

function harness() {
	let notify: Parameters<PostHog["onFeatureFlags"]>[0] = () => {};
	let flag: string | boolean | undefined;
	let optedOut = false;
	let assignment: HeadlineAssignment | undefined;
	const capture = mock(() => undefined);
	const unsubscribe = mock(() => {});
	const getFeatureFlag = mock(() => flag);
	const stop = subscribeToHeadlineVariant(
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

describe("hero headline experiment", () => {
	test.each([
		"control",
		"ide",
		"army",
	])("records %s once, only after the rendered arm is seen", (variant) => {
		const h = harness();
		h.resolve(variant);
		expect(h.assignment?.variant).toBe(variant);
		expect(h.getFeatureFlag).toHaveBeenCalledWith(HERO_HEADLINE_FLAG, {
			send_event: false,
		});
		expect(h.capture).not.toHaveBeenCalled();
		h.assignment?.recordExposure();
		h.assignment?.recordExposure();
		expect(h.capture).toHaveBeenCalledTimes(1);
		expect(h.capture).toHaveBeenCalledWith("$feature_flag_called", {
			$feature_flag: HERO_HEADLINE_FLAG,
			$feature_flag_response: variant,
			[`$feature/${HERO_HEADLINE_FLAG}`]: variant,
			experiment_surface: "marketing_hero_headline",
		});
	});

	test("unloaded, disabled, unexpected and failed flags do not enroll", () => {
		const h = harness();
		for (const value of [undefined, false, true, "unexpected"])
			h.resolve(value);
		h.resolve("army", true);
		expect(h.assignment).toBeUndefined();
		h.resolve("army");
		expect(h.assignment?.variant).toBe("army");
	});

	test("keeps the first assignment when flags refresh", () => {
		const h = harness();
		h.resolve("ide");
		h.resolve("army");
		expect(h.assignment?.variant).toBe("ide");
	});

	test("opted-out visitors are not enrolled or recorded", () => {
		const h = harness();
		h.optOut();
		h.resolve("ide");
		expect(h.assignment).toBeUndefined();
		expect(h.capture).not.toHaveBeenCalled();
	});

	test("stopping unsubscribes and blocks a late exposure", () => {
		const h = harness();
		h.resolve("ide");
		h.stop();
		h.assignment?.recordExposure();
		expect(h.unsubscribe).toHaveBeenCalledTimes(1);
		expect(h.capture).not.toHaveBeenCalled();
	});
});
