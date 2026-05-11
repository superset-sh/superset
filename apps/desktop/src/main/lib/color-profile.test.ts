import { describe, expect, mock, test } from "bun:test";
import {
	applyDisplayP3ColorProfile,
	DISPLAY_P3_VALUE,
	FORCE_COLOR_PROFILE_SWITCH,
} from "./color-profile";

describe("applyDisplayP3ColorProfile", () => {
	test("appends the display-p3 force-color-profile switch exactly once", () => {
		const appendSwitch = mock(() => {});

		applyDisplayP3ColorProfile({ appendSwitch });

		expect(appendSwitch).toHaveBeenCalledTimes(1);
		expect(appendSwitch).toHaveBeenCalledWith(
			FORCE_COLOR_PROFILE_SWITCH,
			DISPLAY_P3_VALUE,
		);
	});

	test("uses the Chromium-recognized switch name and value", () => {
		expect(FORCE_COLOR_PROFILE_SWITCH).toBe("force-color-profile");
		expect(DISPLAY_P3_VALUE).toBe("display-p3");
	});
});
