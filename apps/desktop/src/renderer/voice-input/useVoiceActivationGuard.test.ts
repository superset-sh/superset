import { describe, expect, test } from "bun:test";
import {
	runVoiceActivationHotkeyEvent,
	runVoiceActivationShortcut,
} from "./useVoiceActivationGuard";

describe("voice activation guard", () => {
	test("blocksActivationWhenVoiceInputIsDisabled", () => {
		let activationCount = 0;

		const result = runVoiceActivationShortcut({
			voiceInputEnabled: false,
			getActiveTarget: () => "chat",
			onActivate: () => {
				activationCount += 1;
			},
		});

		expect(result).toEqual({ status: "disabled" });
		expect(activationCount).toBe(0);
	});

	test("evaluatesTargetWhenVoiceInputIsEnabled", () => {
		let targetChecks = 0;

		runVoiceActivationShortcut({
			voiceInputEnabled: true,
			getActiveTarget: () => {
				targetChecks += 1;
				return "chat";
			},
			onActivate: () => {},
		});

		expect(targetChecks).toBe(1);
	});

	test("returnsUnsupportedTargetWithoutStartingCapture", () => {
		let activationCount = 0;

		const result = runVoiceActivationShortcut({
			voiceInputEnabled: true,
			getActiveTarget: () => null,
			onActivate: () => {
				activationCount += 1;
			},
		});

		expect(result).toEqual({
			status: "unsupported-target",
			reason: "no-supported-target-focused",
		});
		expect(activationCount).toBe(0);
	});

	test("doesNotPreventDefaultForDisabledVoiceHotkey", () => {
		let activationCount = 0;
		const event = new Event("keydown", { cancelable: true });

		const result = runVoiceActivationHotkeyEvent(
			event as Pick<KeyboardEvent, "preventDefault">,
			() =>
				runVoiceActivationShortcut({
					voiceInputEnabled: false,
					getActiveTarget: () => "chat",
					onActivate: () => {
						activationCount += 1;
					},
				}),
		);

		expect(result).toEqual({ status: "disabled" });
		expect(event.defaultPrevented).toBe(false);
		expect(activationCount).toBe(0);
	});

	test("preventsDefaultOnlyAfterAllowedVoiceHotkeyActivation", () => {
		let activationCount = 0;
		const event = new Event("keydown", { cancelable: true });

		const result = runVoiceActivationHotkeyEvent(
			event as Pick<KeyboardEvent, "preventDefault">,
			() =>
				runVoiceActivationShortcut({
					voiceInputEnabled: true,
					getActiveTarget: () => "chat",
					onActivate: () => {
						activationCount += 1;
					},
				}),
		);

		expect(result).toEqual({ status: "allowed", target: "chat" });
		expect(event.defaultPrevented).toBe(true);
		expect(activationCount).toBe(1);
	});
});
